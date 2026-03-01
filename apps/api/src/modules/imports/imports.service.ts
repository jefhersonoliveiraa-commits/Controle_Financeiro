import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  type ImportInputFormat,
  type ImportTransactionPreviewInput,
  importTransactionCommitSchema,
  importTransactionPreviewSchema,
  importTransactionRowSchema
} from "@financeiro/contracts";
import { isSameDay } from "date-fns";
import { createHash, randomUUID } from "node:crypto";
import { validateWithZod } from "../../common/zod.js";
import { decimalToNumber } from "../../common/number.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { parseOfxContent } from "./ofx.js";

type ParsedCsvRow = {
  rowNumber: number;
  fields: string[];
};

type NormalizedRow = {
  rowNumber: number;
  date: string;
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  sourceFormat: ImportInputFormat;
  externalRef?: string;
  memo?: string;
  bankId?: string;
  accountRef?: string;
  categoryId?: string;
  suggestedCategoryId?: string;
  suggestionConfidence?: number;
  partyId?: string;
  note?: string;
  paymentMethod?: string;
  costCenter?: string;
  behavior?: "FIXED" | "VARIABLE" | "PROVISION";
  isTransfer?: boolean;
  transferAccountId?: string;
  hash: string;
  errors: string[];
};

type SuggestionDescriptor = {
  normalizedDescription: string;
  descriptionTokens: Set<string>;
  type: "INCOME" | "EXPENSE";
  accountId: string;
  categoryId: string;
};

@Injectable()
export class ImportsService {
  constructor(private readonly prisma: PrismaService) {}

  async previewTransactions(userId: string, payload: unknown) {
    const input = validateWithZod(importTransactionPreviewSchema, payload);
    await this.assertAccountOwnership(userId, input.accountId);
    if (input.defaultCategoryId) {
      await this.assertCategoryOwnership(userId, input.defaultCategoryId);
    }

    const source = this.resolvePreviewSource(input);
    const normalizedRows =
      source.format === "CSV"
        ? this.parseCsv(source.content, input.delimiter, input.hasHeader).map((row) =>
            this.normalizeCsvRow(row, input)
          )
        : this.normalizeOfxRows(source.content, input);

    await this.applyCategorySuggestions(userId, input.accountId, normalizedRows);

    const validHashes = normalizedRows
      .filter((row) => row.errors.length === 0)
      .map((row) => row.hash);

    const existingRows = validHashes.length
      ? await this.prisma.transaction.findMany({
          where: { userId, externalHash: { in: validHashes } },
          select: { id: true, externalHash: true }
        })
      : [];
    const duplicateMap = new Map(existingRows.map((item) => [item.externalHash ?? "", item.id]));

    const validDates = normalizedRows
      .filter((row) => row.errors.length === 0)
      .map((row) => new Date(`${row.date}T12:00:00.000Z`));
    const rangeStart =
      validDates.length > 0
        ? new Date(Math.min(...validDates.map((item) => item.getTime())))
        : new Date();
    const rangeEnd =
      validDates.length > 0
        ? new Date(Math.max(...validDates.map((item) => item.getTime())))
        : new Date();

    const pendingRows = validDates.length
      ? await this.prisma.transaction.findMany({
          where: {
            userId,
            accountId: input.accountId,
            status: "PENDING",
            dueDate: { gte: this.startOfDay(rangeStart), lte: this.endOfDay(rangeEnd) }
          },
          select: {
            id: true,
            dueDate: true,
            type: true,
            description: true,
            amountPlanned: true
          },
          orderBy: { dueDate: "asc" }
        })
      : [];

    const rows = normalizedRows.map((row) => {
      const duplicateOf = duplicateMap.get(row.hash);
      const suggestion = !duplicateOf
        ? pendingRows.find(
            (candidate) =>
              isSameDay(candidate.dueDate, new Date(`${row.date}T12:00:00.000Z`)) &&
              candidate.type === row.type &&
              Math.abs(decimalToNumber(candidate.amountPlanned) - row.amount) < 0.01 &&
              (candidate.description.toLowerCase().includes(row.description.toLowerCase()) ||
                row.description.toLowerCase().includes(candidate.description.toLowerCase()))
          )
        : undefined;

      const status =
        row.errors.length > 0 ? "INVALID" : duplicateOf ? "DUPLICATE" : "VALID";

      return {
        rowNumber: row.rowNumber,
        date: row.date,
        description: row.description,
        amount: row.amount,
        type: row.type,
        sourceFormat: row.sourceFormat,
        externalRef: row.externalRef,
        memo: row.memo,
        bankId: row.bankId,
        accountRef: row.accountRef,
        categoryId: row.categoryId,
        suggestedCategoryId: row.suggestedCategoryId,
        suggestionConfidence: row.suggestionConfidence,
        isTransfer: row.isTransfer,
        transferAccountId: row.transferAccountId,
        status,
        duplicateOfTransactionId: duplicateOf,
        suggestedReconcileTransactionId: suggestion?.id,
        errors: row.errors,
        hash: row.hash
      };
    });

    return {
      fileName: input.fileName,
      inputFormat: source.format,
      totalRows: rows.length,
      validRows: rows.filter((row) => row.status === "VALID").length,
      duplicateRows: rows.filter((row) => row.status === "DUPLICATE").length,
      invalidRows: rows.filter((row) => row.status === "INVALID").length,
      rows
    };
  }

  async commitTransactions(userId: string, payload: unknown) {
    const input = validateWithZod(importTransactionCommitSchema, payload);
    const inputAccount = await this.assertAccountOwnership(userId, input.accountId);

    const checksum = createHash("sha256")
      .update(`${input.fileName}:${JSON.stringify(input.rows)}`)
      .digest("hex");

    const batch = await this.prisma.importBatch.create({
      data: {
        userId,
        fileName: input.fileName,
        checksum,
        totalRows: input.rows.length,
        importedRows: 0,
        skippedRows: 0
      }
    });

    const createdTransactionIds: string[] = [];
    let importedCount = 0;
    let skippedCount = 0;
    let reconciledCount = 0;

    for (const row of input.rows) {
      const normalized = validateWithZod(importTransactionRowSchema, row);
      const dateString = this.normalizeDate(normalized.date);
      if (!dateString) {
        skippedCount += 1;
        continue;
      }
      const hash = this.buildExternalHash({
        date: dateString,
        description: normalized.description,
        amount: normalized.amount,
        accountId: input.accountId,
        externalRef: normalized.externalRef
      });

      if (normalized.isTransfer) {
        if (!normalized.transferAccountId || normalized.transferAccountId === input.accountId) {
          skippedCount += 1;
          continue;
        }

        const transferAccount = await this.assertAccountOwnership(userId, normalized.transferAccountId);
        const transferResult = await this.commitTransferRow({
          userId,
          normalized,
          input,
          inputAccount,
          transferAccount,
          dateString,
          hash,
          batchId: batch.id
        });
        if (transferResult.skipped) {
          skippedCount += 1;
          continue;
        }
        createdTransactionIds.push(...transferResult.createdIds);
        importedCount += 1;
        continue;
      }

      const categoryId = normalized.categoryId ?? normalized.suggestedCategoryId;
      if (!categoryId) {
        skippedCount += 1;
        continue;
      }

      await this.assertCategoryOwnership(userId, categoryId);
      if (normalized.partyId) {
        await this.assertPartyOwnership(userId, normalized.partyId);
      }

      if (input.dedupe) {
        const duplicate = await this.prisma.transaction.findFirst({
          where: { userId, externalHash: hash },
          select: { id: true }
        });
        if (duplicate) {
          skippedCount += 1;
          continue;
        }
      }

      const date = new Date(`${dateString}T12:00:00.000Z`);
      const dayStart = this.startOfDay(date);
      const dayEnd = this.endOfDay(date);
      if (input.dedupe && this.isLikelyTransferDescription(normalized.description, normalized.memo)) {
        const transferDuplicate = await this.prisma.transaction.findFirst({
          where: {
            userId,
            accountId: input.accountId,
            transferGroupId: { not: null },
            dueDate: { gte: dayStart, lte: dayEnd },
            type: normalized.type,
            amountPlanned: {
              gte: Number((normalized.amount - 0.01).toFixed(2)),
              lte: Number((normalized.amount + 0.01).toFixed(2))
            },
            status: { not: "CANCELED" }
          },
          select: { id: true }
        });
        if (transferDuplicate) {
          skippedCount += 1;
          continue;
        }
      }
      const candidate = input.reconcileMatches
        ? await this.prisma.transaction.findFirst({
            where: {
              userId,
              accountId: input.accountId,
              status: "PENDING",
              type: normalized.type,
              dueDate: { gte: dayStart, lte: dayEnd },
              amountPlanned: {
                gte: Number((normalized.amount - 0.01).toFixed(2)),
                lte: Number((normalized.amount + 0.01).toFixed(2))
              }
            },
            orderBy: { createdAt: "asc" }
          })
        : null;

      if (candidate) {
        const status = normalized.type === "INCOME" ? "RECEIVED" : "PAID";
        const updated = await this.prisma.transaction.update({
          where: { id: candidate.id },
          data: {
            status,
            amountActual: normalized.amount,
            effectiveAt: date,
            source: "IMPORT",
            externalHash: hash,
            importBatchId: batch.id,
            reconciledAt: new Date(),
            note: normalized.note ?? normalized.memo ?? undefined,
            paymentMethod: normalized.paymentMethod,
            costCenter: normalized.costCenter
          },
          select: { id: true }
        });
        createdTransactionIds.push(updated.id);
        importedCount += 1;
        reconciledCount += 1;
        continue;
      }

      const created = await this.prisma.transaction.create({
        data: {
          userId,
          type: normalized.type,
          description: normalized.description,
          categoryId,
          accountId: input.accountId,
          partyId: normalized.partyId ?? null,
          dueDate: date,
          amountPlanned: normalized.amount,
          status: input.defaultStatus,
          behavior: normalized.behavior ?? input.defaultBehavior,
          note: normalized.note ?? normalized.memo ?? undefined,
          costCenter: normalized.costCenter,
          paymentMethod: normalized.paymentMethod,
          source: input.source,
          externalHash: hash,
          importBatchId: batch.id,
          reconciledAt: null
        },
        select: { id: true }
      });

      createdTransactionIds.push(created.id);
      importedCount += 1;
    }

    await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        importedRows: importedCount,
        skippedRows: skippedCount
      }
    });

    return {
      batchId: batch.id,
      importedCount,
      skippedCount,
      reconciledCount,
      createdTransactionIds
    };
  }

  private async commitTransferRow(input: {
    userId: string;
    normalized: {
      description: string;
      amount: number;
      type: "INCOME" | "EXPENSE";
      note?: string;
      memo?: string;
      paymentMethod?: string;
      costCenter?: string;
      externalRef?: string;
    };
    input: {
      accountId: string;
      dedupe: boolean;
      defaultStatus: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
      source: "MANUAL" | "RECURRENCE" | "IMPORT";
    };
    inputAccount: { id: string; name: string };
    transferAccount: { id: string; name: string };
    dateString: string;
    hash: string;
    batchId: string;
  }) {
    const {
      userId,
      normalized,
      input: commitInput,
      inputAccount,
      transferAccount,
      dateString,
      hash,
      batchId
    } = input;

    const dayDate = new Date(`${dateString}T12:00:00.000Z`);
    const dayStart = this.startOfDay(dayDate);
    const dayEnd = this.endOfDay(dayDate);

    if (commitInput.dedupe) {
      const existingTransferRow = await this.prisma.transaction.findFirst({
        where: {
          userId,
          accountId: commitInput.accountId,
          transferAccountId: transferAccount.id,
          transferGroupId: { not: null },
          dueDate: { gte: dayStart, lte: dayEnd },
          type: normalized.type,
          amountPlanned: {
            gte: Number((normalized.amount - 0.01).toFixed(2)),
            lte: Number((normalized.amount + 0.01).toFixed(2))
          },
          status: { not: "CANCELED" }
        },
        select: { id: true }
      });
      if (existingTransferRow) {
        return {
          skipped: true as const,
          createdIds: [] as string[]
        };
      }

      const duplicateByHash = await this.prisma.transaction.findFirst({
        where: { userId, externalHash: hash },
        select: { id: true }
      });
      if (duplicateByHash) {
        return {
          skipped: true as const,
          createdIds: [] as string[]
        };
      }
    }

    const transferCategoryId = await this.ensureTransferCategory(userId);
    const transferGroupId = randomUUID();
    const fromAccountId = normalized.type === "EXPENSE" ? inputAccount.id : transferAccount.id;
    const toAccountId = normalized.type === "EXPENSE" ? transferAccount.id : inputAccount.id;
    const fromAccountName = normalized.type === "EXPENSE" ? inputAccount.name : transferAccount.name;
    const toAccountName = normalized.type === "EXPENSE" ? transferAccount.name : inputAccount.name;
    const shouldSettle =
      commitInput.defaultStatus === "PAID" || commitInput.defaultStatus === "RECEIVED";
    const amountActual = shouldSettle ? normalized.amount : null;
    const effectiveAt = shouldSettle ? dayDate : null;

    const outgoingHash = this.buildExternalHash({
      date: dateString,
      description: normalized.description,
      amount: normalized.amount,
      accountId: fromAccountId,
      externalRef: normalized.externalRef
    });
    const incomingHash = this.buildExternalHash({
      date: dateString,
      description: normalized.description,
      amount: normalized.amount,
      accountId: toAccountId,
      externalRef: normalized.externalRef
    });

    const created = await this.prisma.$transaction(async (tx) => {
      const outgoing = await tx.transaction.create({
        data: {
          userId,
          type: "EXPENSE",
          description: `${normalized.description.trim()} -> ${toAccountName}`,
          categoryId: transferCategoryId,
          accountId: fromAccountId,
          transferAccountId: toAccountId,
          transferGroupId,
          dueDate: dayDate,
          amountPlanned: normalized.amount,
          amountActual,
          status: shouldSettle ? "PAID" : "PENDING",
          behavior: "FIXED",
          note: normalized.note ?? normalized.memo ?? undefined,
          costCenter: normalized.costCenter,
          paymentMethod: normalized.paymentMethod,
          effectiveAt,
          source: commitInput.source,
          externalHash: outgoingHash,
          importBatchId: batchId,
          reconciledAt: null,
          cardOwnership: "SELF"
        },
        select: { id: true }
      });

      const incoming = await tx.transaction.create({
        data: {
          userId,
          type: "INCOME",
          description: `${normalized.description.trim()} <- ${fromAccountName}`,
          categoryId: transferCategoryId,
          accountId: toAccountId,
          transferAccountId: fromAccountId,
          transferGroupId,
          dueDate: dayDate,
          amountPlanned: normalized.amount,
          amountActual,
          status: shouldSettle ? "RECEIVED" : "PENDING",
          behavior: "FIXED",
          note: normalized.note ?? normalized.memo ?? undefined,
          costCenter: normalized.costCenter,
          paymentMethod: normalized.paymentMethod,
          effectiveAt,
          source: commitInput.source,
          externalHash: incomingHash,
          importBatchId: batchId,
          reconciledAt: null,
          cardOwnership: "SELF"
        },
        select: { id: true }
      });

      return { outgoing, incoming };
    });

    return {
      skipped: false as const,
      createdIds: [created.outgoing.id, created.incoming.id]
    };
  }

  private resolvePreviewSource(input: ImportTransactionPreviewInput): {
    format: ImportInputFormat;
    content: string;
  } {
    const fileContent = input.fileContent?.trim();
    const csvContent = input.csvContent?.trim();
    const ofxContent = input.ofxContent?.trim();
    const content = fileContent || csvContent || ofxContent;

    if (!content) {
      throw new BadRequestException("Arquivo vazio ou conteudo nao informado.");
    }

    const format = input.inputFormat ?? this.detectInputFormat(content);
    return { format, content };
  }

  private detectInputFormat(content: string): ImportInputFormat {
    const head = content.trim().slice(0, 512).toUpperCase();
    if (
      head.includes("<OFX") ||
      head.includes("OFXHEADER:") ||
      head.includes("<BANKMSGSRSV1>") ||
      head.includes("<STMTTRN>")
    ) {
      return "OFX";
    }
    return "CSV";
  }

  private parseCsv(content: string, delimiter: "," | ";" | "\t", hasHeader: boolean): ParsedCsvRow[] {
    const lines = content
      .replace(/\r/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      throw new BadRequestException("CSV vazio.");
    }

    const startIndex = hasHeader ? 1 : 0;
    return lines.slice(startIndex).map((line, idx) => ({
      rowNumber: idx + 1,
      fields: this.splitCsvLine(line, delimiter)
    }));
  }

  private normalizeCsvRow(
    row: ParsedCsvRow,
    input: ImportTransactionPreviewInput
  ): NormalizedRow {
    const [
      dateRaw = "",
      descriptionRaw = "",
      amountRaw = "",
      typeRaw = "",
      categoryIdRaw = "",
      partyIdRaw = "",
      noteRaw = "",
      paymentMethodRaw = "",
      costCenterRaw = "",
      behaviorRaw = "",
      externalRefRaw = "",
      memoRaw = "",
      isTransferRaw = "",
      transferAccountIdRaw = ""
    ] = row.fields;

    const errors: string[] = [];
    const description = descriptionRaw.trim();
    if (!description) {
      errors.push("Descricao obrigatoria.");
    }

    const amount = this.parseMoney(amountRaw);
    if (!Number.isFinite(amount) || amount < 0) {
      errors.push("Valor invalido.");
    }

    const normalizedDate = this.normalizeDate(dateRaw);
    if (!normalizedDate) {
      errors.push("Data invalida.");
    }

    const type = this.normalizeType(typeRaw) ?? input.defaultType;
    const behavior = this.normalizeBehavior(behaviorRaw) ?? input.defaultBehavior;

    const categoryId = (categoryIdRaw.trim() || input.defaultCategoryId || "").trim() || undefined;
    const partyId = partyIdRaw.trim() || undefined;
    const note = noteRaw.trim() || undefined;
    const memo = memoRaw.trim() || undefined;
    const paymentMethod = paymentMethodRaw.trim() || undefined;
    const costCenter = costCenterRaw.trim() || undefined;
    const externalRef = externalRefRaw.trim() || undefined;
    const isTransfer = this.normalizeBoolean(isTransferRaw);
    const transferAccountId = transferAccountIdRaw.trim() || undefined;

    const hash = this.buildExternalHash({
      date: normalizedDate || "invalid-date",
      description,
      amount: Number.isFinite(amount) ? amount : 0,
      accountId: input.accountId,
      externalRef
    });

    return {
      rowNumber: row.rowNumber,
      date: normalizedDate || "",
      description,
      amount,
      type,
      sourceFormat: "CSV",
      externalRef,
      memo,
      categoryId,
      partyId,
      note,
      paymentMethod,
      costCenter,
      behavior,
      isTransfer,
      transferAccountId,
      hash,
      errors
    };
  }

  private normalizeOfxRows(content: string, input: ImportTransactionPreviewInput): NormalizedRow[] {
    const parsed = parseOfxContent(content);
    return parsed.transactions.map((row) => {
      const errors: string[] = [];
      if (!row.date) {
        errors.push("Data invalida.");
      }
      if (!Number.isFinite(row.amount) || row.amount < 0) {
        errors.push("Valor invalido.");
      }
      if (!row.description.trim()) {
        errors.push("Descricao obrigatoria.");
      }

      const categoryId = input.defaultCategoryId || undefined;
      const hash = this.buildExternalHash({
        date: row.date || "invalid-date",
        description: row.description,
        amount: Number.isFinite(row.amount) ? row.amount : 0,
        accountId: input.accountId,
        externalRef: row.externalRef
      });

      return {
        rowNumber: row.rowNumber,
        date: row.date,
        description: row.description,
        amount: row.amount,
        type: row.type,
        sourceFormat: "OFX",
        externalRef: row.externalRef,
        memo: row.memo,
        bankId: parsed.bankId,
        accountRef: parsed.accountRef,
        categoryId,
        behavior: input.defaultBehavior,
        hash,
        errors
      };
    });
  }

  private async applyCategorySuggestions(
    userId: string,
    accountId: string,
    rows: NormalizedRow[]
  ) {
    const history = await this.prisma.transaction.findMany({
      where: {
        userId
      },
      select: {
        description: true,
        type: true,
        accountId: true,
        categoryId: true
      },
      orderBy: { createdAt: "desc" },
      take: 1200
    });

    const exactMap = new Map<string, Map<string, number>>();
    const keywordMap = new Map<string, Map<string, number>>();
    const descriptors: SuggestionDescriptor[] = [];

    for (const item of history) {
      const normalizedDescription = this.normalizeDescription(item.description);
      const key = `${normalizedDescription}|${item.accountId}|${item.type}`;
      const exactEntry = exactMap.get(key) ?? new Map<string, number>();
      exactEntry.set(item.categoryId, (exactEntry.get(item.categoryId) ?? 0) + 1);
      exactMap.set(key, exactEntry);

      const tokens = this.tokenize(normalizedDescription);
      descriptors.push({
        normalizedDescription,
        descriptionTokens: new Set(tokens),
        type: item.type,
        accountId: item.accountId,
        categoryId: item.categoryId
      });

      for (const token of tokens) {
        if (token.length < 4) continue;
        const keywordEntry = keywordMap.get(token) ?? new Map<string, number>();
        keywordEntry.set(item.categoryId, (keywordEntry.get(item.categoryId) ?? 0) + 1);
        keywordMap.set(token, keywordEntry);
      }
    }

    for (const row of rows) {
      if (row.categoryId) {
        row.suggestedCategoryId = row.categoryId;
        row.suggestionConfidence = 1;
      } else {
        const normalizedDescription = this.normalizeDescription(row.description);
        const exactKey = `${normalizedDescription}|${accountId}|${row.type}`;
        const exactCandidate = this.pickMostFrequent(exactMap.get(exactKey));
        if (exactCandidate) {
          row.suggestedCategoryId = exactCandidate.categoryId;
          row.suggestionConfidence = Math.min(0.97, 0.82 + exactCandidate.count / 100);
        } else {
          const fuzzy = this.findFuzzyCandidate(normalizedDescription, row.type, accountId, descriptors);
          if (fuzzy) {
            row.suggestedCategoryId = fuzzy.categoryId;
            row.suggestionConfidence = fuzzy.confidence;
          } else {
            const keyword = this.findKeywordCandidate(normalizedDescription, keywordMap);
            if (keyword) {
              row.suggestedCategoryId = keyword.categoryId;
              row.suggestionConfidence = keyword.confidence;
            }
          }
        }
      }

      if (
        !row.categoryId &&
        row.suggestedCategoryId &&
        (row.suggestionConfidence ?? 0) >= 0.8
      ) {
        row.categoryId = row.suggestedCategoryId;
      }

      if (!row.categoryId && !row.isTransfer) {
        row.errors.push("Categoria obrigatoria.");
      }
    }
  }

  private pickMostFrequent(map?: Map<string, number>) {
    if (!map || map.size === 0) return null;
    let categoryId = "";
    let count = 0;
    for (const [key, value] of map) {
      if (value > count) {
        categoryId = key;
        count = value;
      }
    }
    return categoryId ? { categoryId, count } : null;
  }

  private findFuzzyCandidate(
    normalizedDescription: string,
    type: "INCOME" | "EXPENSE",
    accountId: string,
    descriptors: SuggestionDescriptor[]
  ) {
    const targetTokens = new Set(this.tokenize(normalizedDescription));
    if (targetTokens.size === 0) return null;

    const scoped = descriptors.filter((item) => item.type === type);
    if (scoped.length === 0) return null;

    let bestCategoryId = "";
    let bestScore = 0;
    let bestAccountMatch = false;

    for (const descriptor of scoped) {
      const score = this.jaccard(targetTokens, descriptor.descriptionTokens);
      if (score < 0.55) continue;
      const accountMatch = descriptor.accountId === accountId;
      if (
        score > bestScore ||
        (Math.abs(score - bestScore) < 0.001 && accountMatch && !bestAccountMatch)
      ) {
        bestScore = score;
        bestCategoryId = descriptor.categoryId;
        bestAccountMatch = accountMatch;
      }
    }

    if (!bestCategoryId) return null;
    const confidence = bestAccountMatch ? Math.min(0.79, 0.58 + bestScore * 0.25) : 0.62;
    return { categoryId: bestCategoryId, confidence: Number(confidence.toFixed(2)) };
  }

  private findKeywordCandidate(
    normalizedDescription: string,
    keywordMap: Map<string, Map<string, number>>
  ) {
    const tokens = this.tokenize(normalizedDescription).filter((token) => token.length >= 4);
    if (tokens.length === 0) return null;

    const scores = new Map<string, number>();
    for (const token of tokens) {
      const keywordEntry = keywordMap.get(token);
      if (!keywordEntry) continue;
      for (const [categoryId, count] of keywordEntry) {
        scores.set(categoryId, (scores.get(categoryId) ?? 0) + count);
      }
    }
    if (scores.size === 0) return null;

    let bestCategoryId = "";
    let bestCount = 0;
    for (const [categoryId, count] of scores) {
      if (count > bestCount) {
        bestCategoryId = categoryId;
        bestCount = count;
      }
    }
    if (!bestCategoryId) return null;
    const confidence = Math.min(0.75, 0.52 + Math.min(bestCount, 20) / 100);
    return { categoryId: bestCategoryId, confidence: Number(confidence.toFixed(2)) };
  }

  private normalizeDescription(value: string) {
    return value
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private isLikelyTransferDescription(description: string, memo?: string) {
    const text = this.normalizeDescription(`${description} ${memo ?? ""}`);
    return (
      text.includes("transferencia entre contas") ||
      text.includes("transferencia entre conta") ||
      text.includes("transferencia interna")
    );
  }

  private tokenize(value: string) {
    return this.normalizeDescription(value)
      .split(" ")
      .map((token) => token.trim())
      .filter(Boolean);
  }

  private jaccard(left: Set<string>, right: Set<string>) {
    if (left.size === 0 || right.size === 0) return 0;
    let intersection = 0;
    for (const token of left) {
      if (right.has(token)) {
        intersection += 1;
      }
    }
    const union = new Set([...left, ...right]).size;
    return union > 0 ? intersection / union : 0;
  }

  private splitCsvLine(line: string, delimiter: string) {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];

      if (char === '"' && inQuotes && next === '"') {
        current += '"';
        index += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (char === delimiter && !inQuotes) {
        fields.push(current);
        current = "";
        continue;
      }
      current += char;
    }
    fields.push(current);
    return fields.map((field) => field.trim());
  }

  private normalizeType(value: string): "INCOME" | "EXPENSE" | null {
    const normalized = value.trim().toUpperCase();
    if (normalized === "INCOME" || normalized === "ENTRADA" || normalized === "RECEITA") {
      return "INCOME";
    }
    if (normalized === "EXPENSE" || normalized === "SAIDA" || normalized === "DESPESA") {
      return "EXPENSE";
    }
    return null;
  }

  private normalizeBehavior(value: string): "FIXED" | "VARIABLE" | "PROVISION" | null {
    const normalized = value.trim().toUpperCase();
    if (normalized === "FIXED" || normalized === "FIXO") return "FIXED";
    if (normalized === "VARIABLE" || normalized === "VARIAVEL") return "VARIABLE";
    if (normalized === "PROVISION" || normalized === "PROVISAO") return "PROVISION";
    return null;
  }

  private normalizeBoolean(value: string) {
    const normalized = value.trim().toUpperCase();
    if (!normalized) return false;
    if (["TRUE", "1", "SIM", "S", "YES", "Y"].includes(normalized)) return true;
    if (["FALSE", "0", "NAO", "N", "NO"].includes(normalized)) return false;
    return false;
  }

  private parseMoney(value: string) {
    const raw = value.trim();
    const normalized =
      raw.includes(",") && raw.includes(".")
        ? raw.replace(/\./g, "").replace(",", ".")
        : raw.includes(",")
          ? raw.replace(",", ".")
          : raw;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  private normalizeDate(value: string | Date) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return date.toISOString().slice(0, 10);
  }

  private buildExternalHash(input: {
    date: string;
    description: string;
    amount: number;
    accountId: string;
    externalRef?: string;
  }) {
    const normalizedRef = input.externalRef?.trim().toLowerCase();
    if (normalizedRef) {
      return createHash("sha256")
        .update(
          `${input.accountId}|${normalizedRef}|${input.date}|${input.amount.toFixed(2)}`
        )
        .digest("hex");
    }

    return createHash("sha256")
      .update(
        `${input.date}|${input.amount.toFixed(2)}|${input.description.trim().toLowerCase()}|${input.accountId}`
      )
      .digest("hex");
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  private endOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  }

  private async ensureTransferCategory(userId: string) {
    const category = await this.prisma.category.upsert({
      where: {
        userId_name: {
          userId,
          name: "Transferencia entre contas"
        }
      },
      update: {},
      create: {
        userId,
        name: "Transferencia entre contas",
        type: "BOTH",
        color: "#0ea5e9",
        icon: "arrow-left-right"
      }
    });
    return category.id;
  }

  private async assertAccountOwnership(userId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId },
      select: { id: true, name: true, type: true }
    });
    if (!account) {
      throw new NotFoundException("Conta informada nao pertence ao usuario.");
    }
    return account;
  }

  private async assertCategoryOwnership(userId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
      select: { id: true }
    });
    if (!category) {
      throw new NotFoundException("Categoria informada nao pertence ao usuario.");
    }
  }

  private async assertPartyOwnership(userId: string, partyId: string) {
    const party = await this.prisma.party.findFirst({
      where: { id: partyId, userId },
      select: { id: true }
    });
    if (!party) {
      throw new NotFoundException("Parte informada nao pertence ao usuario.");
    }
  }
}
