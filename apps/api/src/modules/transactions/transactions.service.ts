import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  cardStatementQuerySchema,
  cardInvoicesQuerySchema,
  createCardInvoicePaymentSchema,
  createTransferSchema,
  createTransactionSchema,
  effectivateTransactionSchema,
  markThirdPartyReceivedSchema,
  thirdPartyReceivablesQuerySchema,
  updateCardSplitsSchema,
  type RecurrenceFrequency
} from "@financeiro/contracts";
import { addMonths, endOfMonth, format, isAfter, isEqual, startOfMonth } from "date-fns";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { generateDatesByFrequency } from "../../common/date.js";
import { decimalToNumber } from "../../common/number.js";
import { validateWithZod } from "../../common/zod.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { GoalsService } from "../goals/goals.service.js";
import { Prisma } from "@prisma/client";

const listTransactionQuerySchema = z.object({
  status: z.enum(["PENDING", "PAID", "RECEIVED", "CANCELED"]).optional(),
  type: z.enum(["INCOME", "EXPENSE"]).optional(),
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20)
});

const updateTransactionSchema = z.object({
  description: z.string().min(2).max(180).optional(),
  amountPlanned: z.coerce.number().nonnegative().optional(),
  dueDate: z.string().optional(),
  behavior: z.enum(["FIXED", "VARIABLE", "PROVISION"]).optional(),
  cardOwnership: z.enum(["SELF", "THIRD_PARTY"]).optional(),
  editMode: z.enum(["THIS", "THIS_AND_NEXT"]).default("THIS")
});

const anticipateSchema = z.object({
  dueDate: z.string()
});

type CardSplitView = {
  id: string;
  ownerType: "SELF" | "THIRD_PARTY";
  amount: number;
  partyId: string | null;
  partyName: string | null;
  receivedAt: string | null;
};

type CardStatementRowInternal = {
  id: string;
  description: string;
  type: "INCOME" | "EXPENSE";
  status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
  behavior: "FIXED" | "VARIABLE" | "PROVISION";
  dueDate: string;
  amountPlanned: number;
  amountActual: number | null;
  cardSettledAmount: number;
  cardOwnership: "SELF" | "THIRD_PARTY";
  thirdPartyReceivedAt: string | null;
  ownAmount: number;
  thirdPartyAmount: number;
  thirdPartyReceived: number;
  thirdPartyPending: number;
  splits: CardSplitView[];
  category: { id: string; name: string; color: string };
  account: { id: string; name: string; type: "BANK_ACCOUNT" | "CASH" | "CREDIT_CARD" };
  party?: { id: string; name: string } | null;
  resolvedAmount: number;
};

type ReceivableStatus = "PENDING" | "RECEIVED" | "OVERDUE";

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goalsService: GoalsService
  ) {}

  async create(userId: string, payload: unknown) {
    const input = validateWithZod(createTransactionSchema, payload);
    if (input.amountPlanned < 0) {
      throw new BadRequestException("Valor nao pode ser negativo.");
    }
    const { account } = await this.assertRelatedOwnership(userId, {
      accountId: input.accountId,
      categoryId: input.categoryId,
      partyId: input.partyId,
      recurrenceId: input.recurrenceId,
      goalId: input.goalId
    });
    const cardOwnership = this.resolveCardOwnership({
      accountType: account.type,
      transactionType: input.type,
      requestedOwnership: input.cardOwnership
    });

    if (input.isInstallment && input.installment) {
      return this.createInstallments(userId, input, cardOwnership);
    }

    if (input.behavior === "PROVISION" && input.provisionUntil) {
      return this.createProvisionSeries(userId, input, cardOwnership);
    }

    const dueDate = new Date(input.dueDate);
    let cardInvoiceId: string | null = null;
    let status = input.status ?? "PENDING";
    if (account.type === "CREDIT_CARD") {
      const ensuredAccount = this.assertCardStatementConfig(account);
      const reference = this.resolveInvoiceReferenceByPurchaseDate(
        dueDate,
        ensuredAccount.statementClosingDay
      );
      const invoice = await this.ensureCardInvoice(userId, ensuredAccount, reference);
      cardInvoiceId = invoice.id;
      status = "PENDING";
    }

    const created = await this.prisma.transaction.create({
      data: {
        userId,
        type: input.type,
        description: input.description,
        categoryId: input.categoryId,
        accountId: input.accountId,
        partyId: input.partyId ?? null,
        dueDate,
        amountPlanned: input.amountPlanned,
        status,
        behavior: input.behavior,
        note: input.note,
        costCenter: input.costCenter,
        paymentMethod: input.paymentMethod,
        recurrenceId: input.recurrenceId ?? null,
        goalId: input.goalId ?? null,
        cardInvoiceId,
        cardSettledAmount: 0,
        cardOwnership,
        source: input.recurrenceId ? "RECURRENCE" : "MANUAL"
      },
      include: {
        category: true,
        account: true
      }
    });

    return this.mapTransaction(created);
  }

  async createTransfer(userId: string, payload: unknown) {
    const input = validateWithZod(createTransferSchema, payload);
    if (input.amount <= 0) {
      throw new BadRequestException("Informe um valor maior que zero.");
    }
    if (input.fromAccountId === input.toAccountId) {
      throw new BadRequestException("Selecione contas diferentes para origem e destino.");
    }
    if (input.status === "CANCELED") {
      throw new BadRequestException("Transferencia nao pode ser criada com status cancelado.");
    }

    const [fromAccount, toAccount] = await Promise.all([
      this.prisma.account.findFirst({
        where: { id: input.fromAccountId, userId },
        select: { id: true, name: true, type: true }
      }),
      this.prisma.account.findFirst({
        where: { id: input.toAccountId, userId },
        select: { id: true, name: true, type: true }
      })
    ]);

    if (!fromAccount) {
      throw new NotFoundException("Conta de origem nao pertence ao usuario.");
    }
    if (!toAccount) {
      throw new NotFoundException("Conta de destino nao pertence ao usuario.");
    }

    const transferCategoryId = await this.ensureTransferCategory(userId);
    const transferGroupId = randomUUID();
    const dueDate = new Date(input.dueDate);
    const shouldSettle = input.status !== "PENDING";
    const outgoingStatus = shouldSettle ? "PAID" : "PENDING";
    const incomingStatus = shouldSettle ? "RECEIVED" : "PENDING";
    const amountActual = shouldSettle ? input.amount : null;
    const effectiveAt = shouldSettle ? dueDate : null;
    const baseDescription = input.description.trim();

    const created = await this.prisma.$transaction(async (tx) => {
      const outgoing = await tx.transaction.create({
        data: {
          userId,
          type: "EXPENSE",
          description: `${baseDescription} -> ${toAccount.name}`,
          categoryId: transferCategoryId,
          accountId: fromAccount.id,
          transferAccountId: toAccount.id,
          transferGroupId,
          dueDate,
          amountPlanned: input.amount,
          amountActual,
          status: outgoingStatus,
          behavior: "FIXED",
          note: input.note,
          costCenter: input.costCenter,
          paymentMethod: input.paymentMethod,
          effectiveAt,
          source: "MANUAL",
          cardOwnership: "SELF"
        },
        include: {
          category: true,
          account: true,
          party: true
        }
      });

      const incoming = await tx.transaction.create({
        data: {
          userId,
          type: "INCOME",
          description: `${baseDescription} <- ${fromAccount.name}`,
          categoryId: transferCategoryId,
          accountId: toAccount.id,
          transferAccountId: fromAccount.id,
          transferGroupId,
          dueDate,
          amountPlanned: input.amount,
          amountActual,
          status: incomingStatus,
          behavior: "FIXED",
          note: input.note,
          costCenter: input.costCenter,
          paymentMethod: input.paymentMethod,
          effectiveAt,
          source: "MANUAL",
          cardOwnership: "SELF"
        },
        include: {
          category: true,
          account: true,
          party: true
        }
      });

      return { outgoing, incoming };
    });

    return {
      transferGroupId,
      outgoing: this.mapTransaction(created.outgoing),
      incoming: this.mapTransaction(created.incoming)
    };
  }

  async cardStatement(userId: string, accountId: string, query: unknown) {
    const parsed = validateWithZod(cardStatementQuerySchema, query ?? {});
    const reference = parsed.reference ?? format(new Date(), "yyyy-MM");
    const account = await this.assertCardAccountOwnership(userId, accountId);
    await this.backfillCardInvoicesForAccount(userId, account);
    const invoice = await this.ensureCardInvoice(userId, account, reference);
    const syncedInvoice = await this.recalculateInvoiceSummary(invoice.id);

    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        accountId: account.id,
        cardInvoiceId: invoice.id
      },
      include: {
        category: true,
        account: true,
        party: true,
        cardSplits: {
          include: {
            party: true
          },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }]
    });
    const payments = await this.prisma.cardInvoicePayment.findMany({
      where: { userId, invoiceId: invoice.id },
      orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }]
    });

    const mappedRows = rows.map((row) => this.mapCardStatementRow(row));
    const validRows = mappedRows.filter((row) => row.status !== "CANCELED");
    const expenseTotal = validRows
      .filter((row) => row.type === "EXPENSE")
      .reduce((sum, row) => sum + row.resolvedAmount, 0);
    const incomeTotal = validRows
      .filter((row) => row.type === "INCOME")
      .reduce((sum, row) => sum + row.resolvedAmount, 0);
    const ownExpenses = validRows
      .filter((row) => row.type === "EXPENSE")
      .reduce((sum, row) => sum + row.ownAmount, 0);
    const thirdPartyExpenses = validRows
      .filter((row) => row.type === "EXPENSE")
      .reduce((sum, row) => sum + row.thirdPartyAmount, 0);
    const thirdPartyReceived = validRows
      .filter((row) => row.type === "EXPENSE")
      .reduce((sum, row) => sum + row.thirdPartyReceived, 0);
    const thirdPartyPending = validRows
      .filter((row) => row.type === "EXPENSE")
      .reduce((sum, row) => sum + row.thirdPartyPending, 0);
    const netToPay = ownExpenses + thirdPartyPending - incomeTotal;

    return {
      reference,
      period: {
        startDate: syncedInvoice.cycleStart.toISOString(),
        endDate: syncedInvoice.cycleEnd.toISOString()
      },
      account: {
        id: account.id,
        name: account.name,
        type: "CREDIT_CARD" as const,
        statementClosingDay: account.statementClosingDay,
        statementDueDay: account.statementDueDay
      },
      totals: {
        totalInvoice: Number((expenseTotal - incomeTotal).toFixed(2)),
        ownExpenses: Number(ownExpenses.toFixed(2)),
        thirdPartyExpenses: Number(thirdPartyExpenses.toFixed(2)),
        thirdPartyReceived: Number(thirdPartyReceived.toFixed(2)),
        thirdPartyPending: Number(thirdPartyPending.toFixed(2)),
        netToPay: Number(netToPay.toFixed(2))
      },
      invoice: this.toPublicCardInvoice(syncedInvoice),
      payments: payments.map((payment) => this.toPublicCardInvoicePayment(payment)),
      rows: mappedRows.map((row) => this.toPublicCardStatementRow(row))
    };
  }

  async cardInvoices(userId: string, accountId: string, query: unknown) {
    const parsed = validateWithZod(cardInvoicesQuerySchema, query ?? {});
    const account = await this.assertCardAccountOwnership(userId, accountId);
    await this.backfillCardInvoicesForAccount(userId, account);

    const invoices = await this.prisma.cardInvoice.findMany({
      where: {
        userId,
        accountId,
        reference: {
          gte: parsed.from,
          lte: parsed.to
        },
        status: parsed.status
      },
      orderBy: [{ reference: "desc" }]
    });

    const synced = await Promise.all(
      invoices.map((invoice) => this.recalculateInvoiceSummary(invoice.id))
    );

    return synced.map((invoice) => this.toPublicCardInvoice(invoice));
  }

  async cardInvoicePayments(userId: string, accountId: string, invoiceId: string) {
    const account = await this.assertCardAccountOwnership(userId, accountId);
    await this.backfillCardInvoicesForAccount(userId, account);
    const invoice = await this.prisma.cardInvoice.findFirst({
      where: { id: invoiceId, userId, accountId }
    });
    if (!invoice) {
      throw new NotFoundException("Fatura nao encontrada.");
    }

    const payments = await this.prisma.cardInvoicePayment.findMany({
      where: { userId, invoiceId },
      orderBy: [{ paidAt: "asc" }, { createdAt: "asc" }]
    });

    return payments.map((payment) => this.toPublicCardInvoicePayment(payment));
  }

  async payCardInvoice(userId: string, accountId: string, invoiceId: string, payload: unknown) {
    const input = validateWithZod(createCardInvoicePaymentSchema, payload);
    const account = await this.assertCardAccountOwnership(userId, accountId);
    await this.backfillCardInvoicesForAccount(userId, account);

    const invoice = await this.prisma.cardInvoice.findFirst({
      where: { id: invoiceId, userId, accountId }
    });
    if (!invoice) {
      throw new NotFoundException("Fatura nao encontrada.");
    }

    const fromAccount = await this.prisma.account.findFirst({
      where: { id: input.fromAccountId, userId },
      select: { id: true, name: true, type: true }
    });
    if (!fromAccount) {
      throw new NotFoundException("Conta de origem nao pertence ao usuario.");
    }
    if (fromAccount.id === account.id) {
      throw new BadRequestException("Conta de origem deve ser diferente do cartao.");
    }
    if (fromAccount.type === "CREDIT_CARD") {
      throw new BadRequestException("Pagamento da fatura exige conta origem do tipo banco ou caixa.");
    }

    const syncedInvoice = await this.recalculateInvoiceSummary(invoice.id);
    if (syncedInvoice.status === "PAID") {
      throw new BadRequestException("Esta fatura ja esta quitada.");
    }
    const outstanding = Number(
      (decimalToNumber(syncedInvoice.totalAmount) - decimalToNumber(syncedInvoice.paidAmount)).toFixed(2)
    );
    if (input.amount <= 0) {
      throw new BadRequestException("Informe um valor de pagamento maior que zero.");
    }
    if (input.amount - outstanding > 0.009) {
      throw new BadRequestException("Valor de pagamento maior que o saldo da fatura.");
    }

    const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
    const transferCategoryId = await this.ensureTransferCategory(userId);
    const transferGroupId = randomUUID();

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.transaction.create({
        data: {
          userId,
          type: "EXPENSE",
          description: `Pagamento fatura ${account.name} ${syncedInvoice.reference} -> ${account.name}`,
          categoryId: transferCategoryId,
          accountId: fromAccount.id,
          transferAccountId: account.id,
          transferGroupId,
          dueDate: paidAt,
          amountPlanned: input.amount,
          amountActual: input.amount,
          status: "PAID",
          behavior: "FIXED",
          note: input.note,
          effectiveAt: paidAt,
          source: "MANUAL",
          cardOwnership: "SELF"
        }
      });

      await tx.transaction.create({
        data: {
          userId,
          type: "INCOME",
          description: `Pagamento fatura ${account.name} ${syncedInvoice.reference} <- ${fromAccount.name}`,
          categoryId: transferCategoryId,
          accountId: account.id,
          transferAccountId: fromAccount.id,
          transferGroupId,
          dueDate: paidAt,
          amountPlanned: input.amount,
          amountActual: input.amount,
          status: "RECEIVED",
          behavior: "FIXED",
          note: input.note,
          effectiveAt: paidAt,
          source: "MANUAL",
          cardOwnership: "SELF"
        }
      });

      const payment = await tx.cardInvoicePayment.create({
        data: {
          userId,
          invoiceId: syncedInvoice.id,
          fromAccountId: fromAccount.id,
          transferGroupId,
          paidAt,
          amount: input.amount,
          note: input.note,
          origin: "MANUAL"
        }
      });

      await this.allocatePaymentToInvoice(tx, syncedInvoice.id, payment.id, input.amount);
      const nextInvoice = await this.recalculateInvoiceSummary(syncedInvoice.id, tx);

      return {
        invoice: nextInvoice,
        payment
      };
    });

    return {
      invoice: this.toPublicCardInvoice(result.invoice),
      payment: this.toPublicCardInvoicePayment(result.payment)
    };
  }

  async thirdPartyReceivables(userId: string, query: unknown) {
    const parsed = validateWithZod(thirdPartyReceivablesQuerySchema, query ?? {});
    const reference = parsed.reference ?? format(new Date(), "yyyy-MM");
    const referenceDate = this.parseReferenceMonth(reference);
    const periodStart = startOfMonth(referenceDate);
    const periodEnd = endOfMonth(referenceDate);
    const today = this.startOfDay(new Date());
    const nextWeek = this.endOfDay(
      new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)
    );
    await this.backfillAllCardInvoices(userId);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        type: "EXPENSE",
        status: { not: "CANCELED" },
        cardInvoice: {
          reference
        },
        account: {
          type: "CREDIT_CARD"
        },
        OR: [
          {
            cardSplits: {
              some: { ownerType: "THIRD_PARTY" }
            }
          },
          {
            cardSplits: { none: {} },
            cardOwnership: "THIRD_PARTY"
          }
        ]
      },
      include: {
        category: true,
        account: true,
        party: true,
        cardSplits: {
          include: { party: true },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }]
    });

    const receivableRows = transactions.flatMap((transaction) => {
      const statementRow = this.mapCardStatementRow(transaction);
      const splits = statementRow.splits.filter((split) => split.ownerType === "THIRD_PARTY");

      return splits
        .filter((split) => (parsed.partyId ? split.partyId === parsed.partyId : true))
        .map((split) => {
          const receivedAt = split.receivedAt;
          const status = this.resolveReceivableStatus(transaction.dueDate, receivedAt, today);

          return {
            id: `${transaction.id}:${split.id}`,
            transactionId: transaction.id,
            splitId: split.id,
            description: transaction.description,
            dueDate: transaction.dueDate.toISOString(),
            amount: Number(split.amount.toFixed(2)),
            status,
            receivedAt,
            transactionStatus: transaction.status,
            account: {
              id: transaction.account.id,
              name: transaction.account.name
            },
            category: {
              id: transaction.category.id,
              name: transaction.category.name,
              color: transaction.category.color
            },
            party: split.partyId
              ? {
                  id: split.partyId,
                  name: split.partyName ?? transaction.party?.name ?? "Parte"
                }
              : null,
            splits: statementRow.splits.map((item) => ({
              id: item.id,
              ownerType: item.ownerType,
              amount: item.amount,
              partyId: item.partyId,
              receivedAt: item.receivedAt
            }))
          };
        });
    });

    const filteredRows =
      parsed.status === "ALL"
        ? receivableRows
        : receivableRows.filter((row) => row.status === parsed.status);

    const totals = this.summarizeReceivables(receivableRows, today, nextWeek);

    return {
      reference,
      period: {
        startDate: periodStart.toISOString(),
        endDate: periodEnd.toISOString()
      },
      filters: {
        status: parsed.status,
        partyId: parsed.partyId ?? null
      },
      totals,
      rows: filteredRows
    };
  }

  async updateCardSplits(userId: string, transactionId: string, payload: unknown) {
    const input = validateWithZod(updateCardSplitsSchema, payload);
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId },
      include: {
        account: true,
        cardSplits: true
      }
    });

    if (!transaction) {
      throw new NotFoundException("Lancamento nao encontrado.");
    }
    if (transaction.account.type !== "CREDIT_CARD" || transaction.type !== "EXPENSE") {
      throw new BadRequestException("Rateio e permitido apenas para despesa de cartao.");
    }

    const splitSum = input.splits.reduce((sum, split) => sum + split.amount, 0);
    const plannedAmount = decimalToNumber(transaction.amountPlanned);
    if (Math.abs(splitSum - plannedAmount) > 0.01) {
      throw new BadRequestException("A soma dos splits deve ser igual ao valor planejado.");
    }

    for (const split of input.splits) {
      if (split.ownerType === "THIRD_PARTY") {
        if (!split.partyId) {
          throw new BadRequestException("Split de terceiro exige partyId.");
        }
        const party = await this.prisma.party.findFirst({
          where: {
            id: split.partyId,
            userId
          },
          select: { id: true }
        });
        if (!party) {
          throw new NotFoundException("Parte informada nao pertence ao usuario.");
        }
      }
    }

    const thirdPartySplits = input.splits.filter((item) => item.ownerType === "THIRD_PARTY");
    const ownAmount = input.splits
      .filter((item) => item.ownerType === "SELF")
      .reduce((sum, item) => sum + item.amount, 0);
    const thirdPartyAmount = thirdPartySplits.reduce((sum, item) => sum + item.amount, 0);
    const isFullyThirdParty = ownAmount <= 0.009 && thirdPartyAmount > 0;
    const hasSingleThirdParty = thirdPartySplits.length === 1 && isFullyThirdParty;
    const allThirdPartyReceived =
      thirdPartySplits.length > 0 && thirdPartySplits.every((item) => !!item.receivedAt);
    const latestThirdPartyReceivedAt = allThirdPartyReceived
      ? thirdPartySplits
          .map((item) => (item.receivedAt ? new Date(item.receivedAt) : null))
          .filter((item): item is Date => !!item)
          .sort((left, right) => right.getTime() - left.getTime())[0] ?? new Date()
      : null;

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.transactionCardSplit.deleteMany({
        where: { transactionId: transaction.id }
      });

      await tx.transactionCardSplit.createMany({
        data: input.splits.map((split) => ({
          userId,
          transactionId: transaction.id,
          ownerType: split.ownerType,
          amount: split.amount,
          partyId: split.ownerType === "THIRD_PARTY" ? split.partyId : null,
          receivedAt:
            split.ownerType === "THIRD_PARTY" && split.receivedAt
              ? new Date(split.receivedAt)
              : null
        }))
      });

      const result = await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          cardOwnership: isFullyThirdParty ? "THIRD_PARTY" : "SELF",
          partyId: hasSingleThirdParty ? thirdPartySplits[0]?.partyId ?? null : null,
          thirdPartyReceivedAt:
            isFullyThirdParty ? latestThirdPartyReceivedAt : null
        },
        include: {
          category: true,
          account: true,
          party: true,
          cardSplits: {
            include: {
              party: true
            },
            orderBy: { createdAt: "asc" }
          }
        }
      });

      await tx.transactionHistory.create({
        data: {
          transactionId: transaction.id,
          field: "cardSplits",
          oldValue: JSON.stringify(
            transaction.cardSplits.map((split) => ({
              ownerType: split.ownerType,
              amount: decimalToNumber(split.amount),
              partyId: split.partyId,
              receivedAt: split.receivedAt?.toISOString() ?? null
            }))
          ),
          newValue: JSON.stringify(
            input.splits.map((split) => ({
              ownerType: split.ownerType,
              amount: split.amount,
              partyId: split.partyId ?? null,
              receivedAt: split.receivedAt ?? null
            }))
          )
        }
      });

      return result;
    });

    const statementView = this.mapCardStatementRow(updated);
    return this.toPublicCardStatementRow(statementView);
  }

  async markThirdPartyReceived(userId: string, transactionId: string, payload: unknown) {
    const input = validateWithZod(markThirdPartyReceivedSchema, payload ?? {});
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId },
      include: {
        account: true,
        cardSplits: true
      }
    });

    if (!transaction) {
      throw new NotFoundException("Lancamento nao encontrado.");
    }
    if (transaction.account.type !== "CREDIT_CARD" || transaction.type !== "EXPENSE") {
      throw new BadRequestException("Somente despesas de cartao podem ser marcadas como recebidas de terceiros.");
    }
    const thirdPartySplitCount = transaction.cardSplits.filter(
      (split) => split.ownerType === "THIRD_PARTY"
    ).length;
    if (thirdPartySplitCount === 0 && transaction.cardOwnership !== "THIRD_PARTY") {
      throw new BadRequestException("Este lancamento nao esta marcado como despesa de terceiros.");
    }

    const receivedAt = input.received ? new Date(input.receivedAt ?? new Date()) : null;
    const updated = await this.prisma.$transaction(async (tx) => {
      if (thirdPartySplitCount > 0) {
        await tx.transactionCardSplit.updateMany({
          where: {
            transactionId: transaction.id,
            ownerType: "THIRD_PARTY"
          },
          data: {
            receivedAt
          }
        });
      }

      return tx.transaction.update({
        where: { id: transaction.id },
        data: { thirdPartyReceivedAt: receivedAt },
        include: {
          category: true,
          account: true,
          party: true,
          cardSplits: {
            include: {
              party: true
            },
            orderBy: { createdAt: "asc" }
          }
        }
      });
    });

    await this.prisma.transactionHistory.create({
      data: {
        transactionId: transaction.id,
        field: "thirdPartyReceivedAt",
        oldValue: transaction.thirdPartyReceivedAt?.toISOString() ?? null,
        newValue: receivedAt?.toISOString() ?? null
      }
    });

    const statementView = this.mapCardStatementRow(updated);
    return this.toPublicCardStatementRow(statementView);
  }

  async list(userId: string, query: unknown) {
    const parsed = validateWithZod(listTransactionQuerySchema, query ?? {});
    const page = parsed.page ?? 1;
    const pageSize = parsed.pageSize ?? 20;
    const where: Prisma.TransactionWhereInput = {
      userId,
      status: parsed.status,
      type: parsed.type,
      accountId: parsed.accountId,
      categoryId: parsed.categoryId,
      OR: parsed.search
        ? [
            {
              description: {
                contains: parsed.search,
                mode: "insensitive"
              }
            },
            {
              account: {
                name: {
                  contains: parsed.search,
                  mode: "insensitive"
                }
              }
            },
            {
              category: {
                name: {
                  contains: parsed.search,
                  mode: "insensitive"
                }
              }
            }
          ]
        : undefined,
      dueDate:
        parsed.startDate || parsed.endDate
          ? {
              gte: parsed.startDate ? new Date(parsed.startDate) : undefined,
              lte: parsed.endDate ? new Date(parsed.endDate) : undefined
            }
          : undefined
    };

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.transaction.count({ where }),
      this.prisma.transaction.findMany({
        where,
        include: {
          category: true,
          account: true,
          party: true
        },
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize
      })
    ]);

    return {
      total,
      page,
      pageSize,
      rows: rows.map((row) => this.mapTransaction(row))
    };
  }

  async listInstallmentPlans(userId: string) {
    const plans = await this.prisma.installmentPlan.findMany({
      where: { userId },
      include: {
        account: true,
        category: true,
        transactions: {
          orderBy: [{ installmentNumber: "asc" }, { dueDate: "asc" }]
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return plans.map((plan) => this.mapInstallmentPlan(plan));
  }

  async getInstallmentPlanDetails(userId: string, planId: string) {
    const plan = await this.prisma.installmentPlan.findFirst({
      where: { id: planId, userId },
      include: {
        account: true,
        category: true,
        transactions: {
          include: {
            category: true,
            account: true
          },
          orderBy: [{ installmentNumber: "asc" }, { dueDate: "asc" }]
        }
      }
    });

    if (!plan) {
      throw new NotFoundException("Parcelamento nao encontrado.");
    }

    const mapped = this.mapInstallmentPlan(plan);
    return {
      ...mapped,
      transactions: plan.transactions.map((row) => this.mapTransaction(row))
    };
  }

  async effectivate(userId: string, transactionId: string, payload: unknown) {
    const input = validateWithZod(effectivateTransactionSchema, payload);
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId },
      include: {
        account: true
      }
    });

    if (!transaction) {
      throw new NotFoundException("Lancamento nao encontrado.");
    }
    if (transaction.status === "CANCELED") {
      throw new BadRequestException("Nao e possivel efetivar um lancamento cancelado.");
    }
    if (transaction.account.type === "CREDIT_CARD") {
      throw new BadRequestException("Use pagamento de fatura para lancamentos de cartao.");
    }

    const resolvedAmount =
      input.keepAmount || input.actualAmount === undefined
        ? decimalToNumber(transaction.amountPlanned)
        : input.actualAmount;

    if (resolvedAmount < 0) {
      throw new BadRequestException("Valor nao pode ser negativo.");
    }

    const status = transaction.type === "INCOME" ? "RECEIVED" : "PAID";
    const effectiveAt = input.paidAt ? new Date(input.paidAt) : new Date();
    const goalIds = new Set<string>();

    if (transaction.transferGroupId) {
      const updatedRows = await this.prisma.$transaction(async (tx) => {
        const transferRows = await tx.transaction.findMany({
          where: {
            userId,
            transferGroupId: transaction.transferGroupId
          },
          orderBy: { createdAt: "asc" }
        });

        const results = [];

        for (const transferRow of transferRows) {
          const rowResolvedAmount =
            input.keepAmount || input.actualAmount === undefined
              ? decimalToNumber(transferRow.amountPlanned)
              : input.actualAmount;
          const rowStatus = transferRow.type === "INCOME" ? "RECEIVED" : "PAID";

          const result = await tx.transaction.update({
            where: { id: transferRow.id },
            data: {
              status: rowStatus,
              amountActual: rowResolvedAmount,
              effectiveAt,
              isProjected: false
            },
            include: {
              category: true,
              account: true,
              party: true
            }
          });

          if (rowResolvedAmount !== decimalToNumber(transferRow.amountPlanned)) {
            await tx.transactionHistory.create({
              data: {
                transactionId: transferRow.id,
                field: "amountActual",
                oldValue: decimalToNumber(transferRow.amountPlanned).toFixed(2),
                newValue: rowResolvedAmount.toFixed(2)
              }
            });
          }

          if (transferRow.status !== rowStatus) {
            await tx.transactionHistory.create({
              data: {
                transactionId: transferRow.id,
                field: "status",
                oldValue: transferRow.status,
                newValue: rowStatus
              }
            });
          }

          results.push(result);
        }

        return results;
      });

      const selected =
        updatedRows.find((row) => row.id === transaction.id) ?? updatedRows[0];

      for (const row of updatedRows) {
        if (row.goalId) {
          goalIds.add(row.goalId);
        }
      }

      for (const goalId of goalIds) {
        await this.goalsService.recalculateGoal(userId, goalId);
      }

      if (!selected) {
        throw new NotFoundException("Lancamento nao encontrado.");
      }
      return this.mapTransaction(selected);
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.transaction.update({
        where: { id: transaction.id },
        data: {
          status,
          amountActual: resolvedAmount,
          effectiveAt,
          isProjected: false
        },
        include: {
          category: true,
          account: true,
          party: true
        }
      });

      if (resolvedAmount !== decimalToNumber(transaction.amountPlanned)) {
        await tx.transactionHistory.create({
          data: {
            transactionId: transaction.id,
            field: "amountActual",
            oldValue: decimalToNumber(transaction.amountPlanned).toFixed(2),
            newValue: resolvedAmount.toFixed(2)
          }
        });
      }

      await tx.transactionHistory.create({
        data: {
          transactionId: transaction.id,
          field: "status",
          oldValue: transaction.status,
          newValue: status
        }
      });

      return result;
    });

    if (transaction.goalId) {
      goalIds.add(transaction.goalId);
    }
    for (const goalId of goalIds) {
      await this.goalsService.recalculateGoal(userId, goalId);
    }

    return this.mapTransaction(updated);
  }

  async update(userId: string, transactionId: string, payload: unknown) {
    const input = validateWithZod(updateTransactionSchema, payload);
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId },
      include: {
        account: true
      }
    });
    if (!transaction) {
      throw new NotFoundException("Lancamento nao encontrado.");
    }

    const cardOwnership =
      input.cardOwnership !== undefined
        ? this.resolveCardOwnership({
            accountType: transaction.account.type,
            transactionType: transaction.type,
            requestedOwnership: input.cardOwnership
          })
        : undefined;

    const data = {
      description: input.description,
      amountPlanned: input.amountPlanned,
      dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
      behavior: input.behavior,
      cardOwnership,
      cardInvoiceId: undefined as string | undefined
    };
    const previousCardInvoiceId = transaction.cardInvoiceId ?? null;
    if (transaction.account.type === "CREDIT_CARD" && input.dueDate) {
      const ensuredCardAccount = this.assertCardStatementConfig({
        id: transaction.account.id,
        name: transaction.account.name,
        type: transaction.account.type,
        statementClosingDay: transaction.account.statementClosingDay,
        statementDueDay: transaction.account.statementDueDay
      });
      const reference = this.resolveInvoiceReferenceByPurchaseDate(
        new Date(input.dueDate),
        ensuredCardAccount.statementClosingDay
      );
      const invoice = await this.ensureCardInvoice(userId, ensuredCardAccount, reference);
      data.cardInvoiceId = invoice.id;
    }

    if (transaction.transferGroupId) {
      const rows = await this.prisma.$transaction(async (tx) => {
        await tx.transaction.updateMany({
          where: {
            userId,
            transferGroupId: transaction.transferGroupId
          },
          data
        });

        return tx.transaction.findMany({
          where: {
            userId,
            transferGroupId: transaction.transferGroupId
          },
          include: {
            category: true,
            account: true,
            party: true
          }
        });
      });

      const selected = rows.find((row) => row.id === transaction.id) ?? rows[0];
      if (!selected) {
        throw new NotFoundException("Lancamento nao encontrado.");
      }
      return this.mapTransaction(selected);
    }

    if (
      input.editMode === "THIS_AND_NEXT" &&
      transaction.installmentPlanId &&
      transaction.installmentNumber
    ) {
      await this.prisma.transaction.updateMany({
        where: {
          userId,
          installmentPlanId: transaction.installmentPlanId,
          installmentNumber: { gte: transaction.installmentNumber }
        },
        data: {
          description: data.description,
          amountPlanned: data.amountPlanned,
          behavior: data.behavior,
          cardOwnership: data.cardOwnership
        }
      });
    }

    const updated = await this.prisma.transaction.update({
      where: { id: transaction.id },
      data,
      include: { category: true, account: true, party: true }
    });
    if (previousCardInvoiceId) {
      await this.recalculateInvoiceSummary(previousCardInvoiceId);
    }
    if (updated.cardInvoiceId && updated.cardInvoiceId !== previousCardInvoiceId) {
      await this.recalculateInvoiceSummary(updated.cardInvoiceId);
    }
    return this.mapTransaction(updated);
  }

  async anticipateInstallment(userId: string, transactionId: string, payload: unknown) {
    const input = validateWithZod(anticipateSchema, payload);
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId }
    });
    if (!transaction) {
      throw new NotFoundException("Parcela nao encontrada.");
    }
    if (!transaction.installmentPlanId) {
      throw new BadRequestException("Este lancamento nao pertence a um parcelamento.");
    }

    const updated = await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { dueDate: new Date(input.dueDate) },
      include: { category: true, account: true, party: true }
    });

    await this.prisma.transactionHistory.create({
      data: {
        transactionId: transaction.id,
        field: "dueDate",
        oldValue: transaction.dueDate.toISOString(),
        newValue: updated.dueDate.toISOString()
      }
    });

    return this.mapTransaction(updated);
  }

  async cancel(userId: string, transactionId: string) {
    const transaction = await this.prisma.transaction.findFirst({
      where: { id: transactionId, userId }
    });
    if (!transaction) {
      throw new NotFoundException("Lancamento nao encontrado.");
    }

    if (transaction.transferGroupId) {
      const rows = await this.prisma.$transaction(async (tx) => {
        const transferRows = await tx.transaction.findMany({
          where: {
            userId,
            transferGroupId: transaction.transferGroupId
          }
        });

        for (const row of transferRows) {
          await tx.transaction.update({
            where: { id: row.id },
            data: { status: "CANCELED" }
          });
          await tx.transactionHistory.create({
            data: {
              transactionId: row.id,
              field: "status",
              oldValue: row.status,
              newValue: "CANCELED"
            }
          });
        }

        return tx.transaction.findMany({
          where: {
            userId,
            transferGroupId: transaction.transferGroupId
          },
          include: {
            category: true,
            account: true,
            party: true
          }
        });
      });

      const selected = rows.find((row) => row.id === transaction.id) ?? rows[0];
      if (!selected) {
        throw new NotFoundException("Lancamento nao encontrado.");
      }
      return this.mapTransaction(selected);
    }

    const updated = await this.prisma.transaction.update({
      where: { id: transaction.id },
      data: { status: "CANCELED" },
      include: { category: true, account: true, party: true }
    });
    await this.prisma.transactionHistory.create({
      data: {
        transactionId: transaction.id,
        field: "status",
        oldValue: transaction.status,
        newValue: "CANCELED"
      }
    });
    if (transaction.cardInvoiceId) {
      await this.recalculateInvoiceSummary(transaction.cardInvoiceId);
    }

    return this.mapTransaction(updated);
  }

  private async createInstallments(
    userId: string,
    input: z.infer<typeof createTransactionSchema>,
    cardOwnership: "SELF" | "THIRD_PARTY"
  ) {
    const installmentInput = input.installment;
    if (!installmentInput) {
      throw new BadRequestException("Dados de parcelamento obrigatorios.");
    }
    if (!installmentInput.totalAmount && !installmentInput.installmentAmount) {
      throw new BadRequestException("Informe valor total ou valor da parcela.");
    }

    const installmentAmount =
      installmentInput.installmentAmount ??
      Number((installmentInput.totalAmount! / installmentInput.installments).toFixed(2));

    const dates = generateDatesByFrequency(
      new Date(installmentInput.firstDueDate),
      installmentInput.installments,
      installmentInput.frequency as RecurrenceFrequency
    );

    const plan = await this.prisma.installmentPlan.create({
      data: {
        userId,
        type: input.type,
        description: input.description,
        totalAmount: installmentInput.totalAmount ?? installmentAmount * installmentInput.installments,
        installmentAmount,
        installments: installmentInput.installments,
        frequency: installmentInput.frequency,
        isVariable: installmentInput.variableInstallments,
        startDate: new Date(installmentInput.firstDueDate),
        accountId: input.accountId,
        categoryId: input.categoryId
      }
    });

    const created = await this.prisma.$transaction(
      dates.map((dueDate, index) =>
        this.prisma.transaction.create({
          data: {
            userId,
            type: input.type,
            description: `${input.description} - Parcela ${index + 1}/${installmentInput.installments}`,
            categoryId: input.categoryId,
            accountId: input.accountId,
            partyId: input.partyId ?? null,
            dueDate,
            amountPlanned: installmentAmount,
            status: "PENDING",
            behavior: installmentInput.variableInstallments ? "VARIABLE" : input.behavior,
            note: input.note,
            costCenter: input.costCenter,
            paymentMethod: input.paymentMethod,
            installmentPlanId: plan.id,
            installmentNumber: index + 1,
            installmentTotal: installmentInput.installments,
            cardOwnership,
            source: "MANUAL"
          },
          include: { category: true, account: true, party: true }
        })
      )
    );

    return {
      installmentPlanId: plan.id,
      totalInstallments: created.length,
      rows: created.map((item) => this.mapTransaction(item))
    };
  }

  private async createProvisionSeries(
    userId: string,
    input: z.infer<typeof createTransactionSchema>,
    cardOwnership: "SELF" | "THIRD_PARTY"
  ) {
    const startDate = new Date(input.dueDate);
    const endDate = new Date(input.provisionUntil!);

    if (isAfter(startDate, endDate)) {
      throw new BadRequestException("A data final da provisao deve ser maior ou igual ao vencimento inicial.");
    }

    const dueDates: Date[] = [];
    let cursor = startDate;
    while (isAfter(endDate, cursor) || isEqual(endDate, cursor)) {
      dueDates.push(cursor);
      cursor = addMonths(cursor, 1);
    }

    const created = await this.prisma.$transaction(
      dueDates.map((dueDate) =>
        this.prisma.transaction.create({
          data: {
            userId,
            type: input.type,
            description: input.description,
            categoryId: input.categoryId,
            accountId: input.accountId,
            partyId: input.partyId ?? null,
            dueDate,
            amountPlanned: input.amountPlanned,
            status: input.status ?? "PENDING",
            behavior: "PROVISION",
            note: input.note,
            costCenter: input.costCenter,
            paymentMethod: input.paymentMethod,
            recurrenceId: input.recurrenceId ?? null,
            goalId: input.goalId ?? null,
            cardOwnership,
            source: "MANUAL"
          },
          include: {
            category: true,
            account: true
          }
        })
      )
    );

    return {
      provisionSeries: true,
      totalCreated: created.length,
      rows: created.map((item) => this.mapTransaction(item))
    };
  }

  private mapInstallmentPlan(plan: {
    id: string;
    description: string;
    installments: number;
    totalAmount: { toString(): string } | null;
    installmentAmount: { toString(): string } | null;
    frequency: "MONTHLY" | "BIWEEKLY" | "WEEKLY";
    isVariable: boolean;
    startDate: Date;
    createdAt: Date;
    account: { id: string; name: string };
    category: { id: string; name: string };
    transactions: Array<{
      id: string;
      dueDate: Date;
      amountPlanned: { toString(): string };
      amountActual: { toString(): string } | null;
      status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
      installmentNumber: number | null;
      installmentTotal: number | null;
    }>;
  }) {
    const paidRows = plan.transactions.filter((item) => item.status === "PAID" || item.status === "RECEIVED");
    const canceledRows = plan.transactions.filter((item) => item.status === "CANCELED");
    const pendingRows = plan.transactions.filter((item) => item.status === "PENDING");

    const plannedTotal = plan.transactions.reduce((sum, item) => sum + decimalToNumber(item.amountPlanned), 0);
    const paidTotal = paidRows.reduce((sum, item) => {
      const amount = item.amountActual ? decimalToNumber(item.amountActual) : decimalToNumber(item.amountPlanned);
      return sum + amount;
    }, 0);
    const progressPercent =
      plan.transactions.length > 0 ? Number(((paidRows.length / plan.transactions.length) * 100).toFixed(2)) : 0;

    return {
      planId: plan.id,
      description: plan.description,
      installments: plan.installments,
      totalAmount: plan.totalAmount ? decimalToNumber(plan.totalAmount) : Number(plannedTotal.toFixed(2)),
      installmentAmount: plan.installmentAmount ? decimalToNumber(plan.installmentAmount) : null,
      frequency: plan.frequency,
      isVariable: plan.isVariable,
      startDate: plan.startDate.toISOString(),
      createdAt: plan.createdAt.toISOString(),
      account: plan.account,
      category: plan.category,
      summary: {
        paidCount: paidRows.length,
        pendingCount: pendingRows.length,
        canceledCount: canceledRows.length,
        paidTotal: Number(paidTotal.toFixed(2)),
        remainingTotal: Number((plannedTotal - paidTotal).toFixed(2)),
        progressPercent
      },
      nextInstallment:
        pendingRows.length > 0
          ? {
              id: pendingRows[0].id,
              dueDate: pendingRows[0].dueDate.toISOString(),
              installmentNumber: pendingRows[0].installmentNumber,
              amountPlanned: decimalToNumber(pendingRows[0].amountPlanned)
            }
          : null
    };
  }

  private async assertRelatedOwnership(
    userId: string,
    input: {
      accountId: string;
      categoryId: string;
      partyId?: string;
      recurrenceId?: string;
      goalId?: string;
    }
  ) {
    const account = await this.prisma.account.findFirst({
      where: { id: input.accountId, userId },
      select: {
        id: true,
        type: true,
        name: true,
        statementClosingDay: true,
        statementDueDay: true
      }
    });
    const category = await this.prisma.category.findFirst({
      where: { id: input.categoryId, userId },
      select: { id: true, name: true }
    });
    const party = input.partyId
      ? await this.prisma.party.findFirst({
          where: { id: input.partyId, userId },
          select: { id: true }
        })
      : null;
    const recurrence = input.recurrenceId
      ? await this.prisma.recurrence.findFirst({
          where: { id: input.recurrenceId, userId },
          select: { id: true }
        })
      : null;
    const goal = input.goalId
      ? await this.prisma.goal.findFirst({
          where: { id: input.goalId, userId },
          select: { id: true }
        })
      : null;

    if (!account) {
      throw new NotFoundException("Conta informada nao pertence ao usuario.");
    }
    if (!category) {
      throw new NotFoundException("Categoria informada nao pertence ao usuario.");
    }
    if (input.partyId && !party) {
      throw new NotFoundException("Parte informada nao pertence ao usuario.");
    }
    if (input.recurrenceId && !recurrence) {
      throw new NotFoundException("Recorrencia informada nao pertence ao usuario.");
    }
    if (input.goalId && !goal) {
      throw new NotFoundException("Meta informada nao pertence ao usuario.");
    }

    return { account, category };
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

  private assertCardStatementConfig(account: {
    id: string;
    name: string;
    type: "BANK_ACCOUNT" | "CASH" | "CREDIT_CARD";
    statementClosingDay: number | null;
    statementDueDay: number | null;
  }) {
    if (account.type !== "CREDIT_CARD") {
      throw new BadRequestException("A conta informada nao e um cartao de credito.");
    }
    if (!account.statementClosingDay || !account.statementDueDay) {
      throw new BadRequestException(
        "Configure dia de fechamento e vencimento do cartao para operar com faturas."
      );
    }
    return {
      ...account,
      statementClosingDay: account.statementClosingDay,
      statementDueDay: account.statementDueDay
    };
  }

  private async assertCardAccountOwnership(userId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId },
      select: {
        id: true,
        name: true,
        type: true,
        statementClosingDay: true,
        statementDueDay: true
      }
    });
    if (!account) {
      throw new NotFoundException("Conta nao encontrada.");
    }
    return this.assertCardStatementConfig(account);
  }

  private resolveInvoiceReferenceByPurchaseDate(date: Date, statementClosingDay: number) {
    const year = date.getFullYear();
    const month = date.getMonth();
    const refDate = date.getDate() <= statementClosingDay ? new Date(year, month, 1) : new Date(year, month + 1, 1);
    return format(refDate, "yyyy-MM");
  }

  private buildInvoiceCycleByReference(reference: string, statementClosingDay: number, statementDueDay: number) {
    const refMonthDate = this.parseReferenceMonth(reference);
    const prevMonthDate = new Date(refMonthDate.getFullYear(), refMonthDate.getMonth() - 1, 1);
    const dueMonthDate = new Date(refMonthDate.getFullYear(), refMonthDate.getMonth() + 1, 1);

    const prevMonthDays = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).getDate();
    const refMonthDays = new Date(refMonthDate.getFullYear(), refMonthDate.getMonth() + 1, 0).getDate();
    const dueMonthDays = new Date(dueMonthDate.getFullYear(), dueMonthDate.getMonth() + 1, 0).getDate();

    const prevClose = new Date(
      prevMonthDate.getFullYear(),
      prevMonthDate.getMonth(),
      Math.min(statementClosingDay, prevMonthDays),
      12,
      0,
      0,
      0
    );
    const cycleStart = new Date(prevClose.getFullYear(), prevClose.getMonth(), prevClose.getDate() + 1, 0, 0, 0, 0);
    const cycleEnd = new Date(
      refMonthDate.getFullYear(),
      refMonthDate.getMonth(),
      Math.min(statementClosingDay, refMonthDays),
      23,
      59,
      59,
      999
    );
    const dueDate = new Date(
      dueMonthDate.getFullYear(),
      dueMonthDate.getMonth(),
      Math.min(statementDueDay, dueMonthDays),
      12,
      0,
      0,
      0
    );

    return { cycleStart, cycleEnd, dueDate };
  }

  private async ensureCardInvoice(
    userId: string,
    account: {
      id: string;
      name: string;
      type: "BANK_ACCOUNT" | "CASH" | "CREDIT_CARD";
      statementClosingDay: number;
      statementDueDay: number;
    },
    reference: string,
    tx?: Prisma.TransactionClient
  ) {
    const db = tx ?? this.prisma;
    const existing = await db.cardInvoice.findFirst({
      where: {
        userId,
        accountId: account.id,
        reference
      }
    });
    if (existing) {
      return existing;
    }

    const cycle = this.buildInvoiceCycleByReference(
      reference,
      account.statementClosingDay,
      account.statementDueDay
    );
    return db.cardInvoice.create({
      data: {
        userId,
        accountId: account.id,
        reference,
        cycleStart: cycle.cycleStart,
        cycleEnd: cycle.cycleEnd,
        dueDate: cycle.dueDate,
        totalAmount: 0,
        paidAmount: 0,
        status: "OPEN"
      }
    });
  }

  private async recalculateInvoiceSummary(invoiceId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const invoice = await db.cardInvoice.findFirst({
      where: { id: invoiceId },
      include: {
        transactions: {
          where: {
            status: { not: "CANCELED" }
          },
          select: {
            type: true,
            amountPlanned: true
          }
        },
        payments: {
          select: {
            amount: true
          }
        }
      }
    });
    if (!invoice) {
      throw new NotFoundException("Fatura nao encontrada.");
    }

    const totalAmount = invoice.transactions.reduce((sum, row) => {
      const value = decimalToNumber(row.amountPlanned);
      return row.type === "EXPENSE" ? sum + value : sum - value;
    }, 0);
    const paidAmount = invoice.payments.reduce((sum, payment) => sum + decimalToNumber(payment.amount), 0);
    const normalizedTotal = Number(Math.max(0, totalAmount).toFixed(2));
    const normalizedPaid = Number(Math.max(0, Math.min(normalizedTotal, paidAmount)).toFixed(2));
    const outstanding = Number((normalizedTotal - normalizedPaid).toFixed(2));
    const status = outstanding <= 0.009 ? "PAID" : normalizedPaid > 0 ? "PARTIALLY_PAID" : "OPEN";

    return db.cardInvoice.update({
      where: { id: invoice.id },
      data: {
        totalAmount: normalizedTotal,
        paidAmount: normalizedPaid,
        status
      }
    });
  }

  private toPublicCardInvoice(invoice: {
    id: string;
    accountId: string;
    reference: string;
    cycleStart: Date;
    cycleEnd: Date;
    dueDate: Date;
    totalAmount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
    status: "OPEN" | "PARTIALLY_PAID" | "PAID";
    createdAt: Date;
    updatedAt: Date;
  }) {
    const total = decimalToNumber(invoice.totalAmount);
    const paid = decimalToNumber(invoice.paidAmount);
    return {
      id: invoice.id,
      accountId: invoice.accountId,
      reference: invoice.reference,
      cycleStart: invoice.cycleStart.toISOString(),
      cycleEnd: invoice.cycleEnd.toISOString(),
      dueDate: invoice.dueDate.toISOString(),
      totalAmount: total,
      paidAmount: paid,
      outstandingAmount: Number(Math.max(0, total - paid).toFixed(2)),
      status: invoice.status,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString()
    };
  }

  private toPublicCardInvoicePayment(payment: {
    id: string;
    invoiceId: string;
    fromAccountId: string | null;
    transferGroupId: string | null;
    paidAt: Date;
    amount: Prisma.Decimal;
    note: string | null;
    origin: "MANUAL" | "MIGRATION";
    createdAt: Date;
  }) {
    return {
      id: payment.id,
      invoiceId: payment.invoiceId,
      fromAccountId: payment.fromAccountId,
      transferGroupId: payment.transferGroupId,
      paidAt: payment.paidAt.toISOString(),
      amount: decimalToNumber(payment.amount),
      note: payment.note,
      origin: payment.origin,
      createdAt: payment.createdAt.toISOString()
    };
  }

  private async backfillAllCardInvoices(userId: string) {
    const accounts = await this.prisma.account.findMany({
      where: {
        userId,
        type: "CREDIT_CARD",
        statementClosingDay: { not: null },
        statementDueDay: { not: null }
      },
      select: {
        id: true,
        name: true,
        type: true,
        statementClosingDay: true,
        statementDueDay: true
      }
    });

    for (const account of accounts) {
      await this.backfillCardInvoicesForAccount(
        userId,
        this.assertCardStatementConfig(account)
      );
    }
  }

  private async backfillCardInvoicesForAccount(
    userId: string,
    account: {
      id: string;
      name: string;
      type: "BANK_ACCOUNT" | "CASH" | "CREDIT_CARD";
      statementClosingDay: number;
      statementDueDay: number;
    }
  ) {
    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        accountId: account.id,
        cardInvoiceId: null,
        transferGroupId: null,
        status: { not: "CANCELED" }
      },
      select: {
        id: true,
        type: true,
        status: true,
        dueDate: true,
        amountPlanned: true,
        amountActual: true
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }]
    });
    if (rows.length === 0) {
      return;
    }

    const touchedInvoices = new Set<string>();
    await this.prisma.$transaction(async (tx) => {
      for (const row of rows) {
        const reference = this.resolveInvoiceReferenceByPurchaseDate(
          row.dueDate,
          account.statementClosingDay
        );
        const invoice = await this.ensureCardInvoice(userId, account, reference, tx);
        const settledAmount =
          row.type === "EXPENSE" && (row.status === "PAID" || row.status === "RECEIVED")
            ? row.amountActual
              ? decimalToNumber(row.amountActual)
              : decimalToNumber(row.amountPlanned)
            : 0;

        await tx.transaction.update({
          where: { id: row.id },
          data: {
            cardInvoiceId: invoice.id,
            cardSettledAmount: Number(settledAmount.toFixed(2))
          }
        });
        touchedInvoices.add(invoice.id);
      }

      for (const invoiceId of touchedInvoices) {
        const synced = await this.recalculateInvoiceSummary(invoiceId, tx);
        const settledRows = await tx.transaction.findMany({
          where: {
            userId,
            cardInvoiceId: invoiceId,
            type: "EXPENSE",
            status: { in: ["PAID", "RECEIVED"] },
            cardSettledAmount: { gt: 0 }
          },
          orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            cardSettledAmount: true
          }
        });
        if (settledRows.length === 0) {
          continue;
        }
        const existingManualPayments = await tx.cardInvoicePayment.count({
          where: { invoiceId, origin: { in: ["MANUAL", "MIGRATION"] } }
        });
        if (existingManualPayments > 0) {
          continue;
        }

        const settledTotal = settledRows.reduce(
          (sum, row) => sum + decimalToNumber(row.cardSettledAmount),
          0
        );
        const maxPayable = Math.min(
          settledTotal,
          decimalToNumber(synced.totalAmount)
        );
        if (maxPayable <= 0.009) {
          continue;
        }

        const payment = await tx.cardInvoicePayment.create({
          data: {
            userId,
            invoiceId,
            fromAccountId: null,
            transferGroupId: null,
            paidAt: synced.dueDate,
            amount: Number(maxPayable.toFixed(2)),
            note: "Backfill de pagamentos historicos",
            origin: "MIGRATION"
          }
        });

        let remaining = Number(maxPayable.toFixed(2));
        for (const row of settledRows) {
          if (remaining <= 0.009) break;
          const settled = decimalToNumber(row.cardSettledAmount);
          const allocated = Math.min(settled, remaining);
          if (allocated <= 0.009) continue;
          await tx.cardInvoicePaymentAllocation.create({
            data: {
              paymentId: payment.id,
              transactionId: row.id,
              amountAllocated: Number(allocated.toFixed(2))
            }
          });
          remaining = Number((remaining - allocated).toFixed(2));
        }
        await this.recalculateInvoiceSummary(invoiceId, tx);
      }
    }, { timeout: 30000 });
  }

  private async allocatePaymentToInvoice(
    tx: Prisma.TransactionClient,
    invoiceId: string,
    paymentId: string,
    amount: number
  ) {
    const rows = await tx.transaction.findMany({
      where: {
        cardInvoiceId: invoiceId,
        type: "EXPENSE",
        status: { not: "CANCELED" }
      },
      orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        amountPlanned: true,
        cardSettledAmount: true
      }
    });

    let remaining = Number(amount.toFixed(2));
    for (const row of rows) {
      if (remaining <= 0.009) {
        break;
      }
      const planned = decimalToNumber(row.amountPlanned);
      const settled = decimalToNumber(row.cardSettledAmount);
      const allocatable = Number(Math.max(0, planned - settled).toFixed(2));
      if (allocatable <= 0.009) {
        continue;
      }
      const allocated = Number(Math.min(allocatable, remaining).toFixed(2));
      if (allocated <= 0.009) {
        continue;
      }

      const nextSettled = Number((settled + allocated).toFixed(2));
      await tx.cardInvoicePaymentAllocation.create({
        data: {
          paymentId,
          transactionId: row.id,
          amountAllocated: allocated
        }
      });
      await tx.transaction.update({
        where: { id: row.id },
        data: {
          cardSettledAmount: nextSettled,
          status: nextSettled >= planned - 0.009 ? "PAID" : "PENDING",
          amountActual: nextSettled >= planned - 0.009 ? planned : null
        }
      });
      remaining = Number((remaining - allocated).toFixed(2));
    }
  }

  private resolveCardOwnership(input: {
    accountType: "BANK_ACCOUNT" | "CASH" | "CREDIT_CARD";
    transactionType: "INCOME" | "EXPENSE";
    requestedOwnership: "SELF" | "THIRD_PARTY";
  }) {
    if (input.requestedOwnership === "THIRD_PARTY") {
      if (input.accountType !== "CREDIT_CARD" || input.transactionType !== "EXPENSE") {
        throw new BadRequestException(
          "A marcacao de terceiros so e permitida para despesas em conta do tipo cartao de credito."
        );
      }
      return "THIRD_PARTY" as const;
    }
    return "SELF" as const;
  }

  private parseReferenceMonth(reference: string) {
    const [yearRaw, monthRaw] = reference.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);

    if (
      !Number.isInteger(year) ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      throw new BadRequestException("Referencia invalida. Use o formato YYYY-MM.");
    }

    return new Date(year, month - 1, 1);
  }

  private startOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  }

  private endOfDay(date: Date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  }

  private resolveReceivableStatus(
    dueDate: Date,
    receivedAt: string | null,
    today: Date
  ): ReceivableStatus {
    if (receivedAt) {
      return "RECEIVED";
    }
    return dueDate.getTime() < today.getTime() ? "OVERDUE" : "PENDING";
  }

  private summarizeReceivables(
    rows: Array<{ amount: number; status: ReceivableStatus; dueDate: string }>,
    today: Date,
    nextWeek: Date
  ) {
    let totalThirdParty = 0;
    let totalReceived = 0;
    let totalPending = 0;
    let pendingCount = 0;
    let receivedCount = 0;
    let overdueCount = 0;
    let dueThisWeekCount = 0;

    for (const row of rows) {
      totalThirdParty += row.amount;
      if (row.status === "RECEIVED") {
        totalReceived += row.amount;
        receivedCount += 1;
        continue;
      }

      totalPending += row.amount;
      const dueDate = new Date(row.dueDate);
      const isOverdue = row.status === "OVERDUE";
      if (isOverdue) {
        overdueCount += 1;
      } else {
        pendingCount += 1;
      }

      if (!isOverdue && dueDate.getTime() >= today.getTime() && dueDate.getTime() <= nextWeek.getTime()) {
        dueThisWeekCount += 1;
      }
    }

    return {
      totalThirdParty: Number(totalThirdParty.toFixed(2)),
      totalReceived: Number(totalReceived.toFixed(2)),
      totalPending: Number(totalPending.toFixed(2)),
      pendingCount,
      receivedCount,
      overdueCount,
      dueThisWeekCount
    };
  }

  private resolveRowAmount(input: { amountPlanned: number; amountActual: number | null; status: string }) {
    if ((input.status === "PAID" || input.status === "RECEIVED") && input.amountActual !== null) {
      return input.amountActual;
    }
    return input.amountPlanned;
  }

  private mapCardStatementRow(transaction: {
    id: string;
    description: string;
    type: "INCOME" | "EXPENSE";
    status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
    behavior: "FIXED" | "VARIABLE" | "PROVISION";
    dueDate: Date;
    amountPlanned: Prisma.Decimal;
    amountActual: Prisma.Decimal | null;
    cardSettledAmount?: Prisma.Decimal;
    cardOwnership?: "SELF" | "THIRD_PARTY";
    thirdPartyReceivedAt?: Date | null;
    category: { id: string; name: string; color: string };
    account: { id: string; name: string; type: "BANK_ACCOUNT" | "CASH" | "CREDIT_CARD" };
    party?: { id: string; name: string } | null;
    cardSplits?: Array<{
      id: string;
      ownerType: "SELF" | "THIRD_PARTY";
      amount: Prisma.Decimal;
      partyId: string | null;
      party?: { id: string; name: string } | null;
      receivedAt: Date | null;
    }>;
  }): CardStatementRowInternal {
    const amountPlanned = decimalToNumber(transaction.amountPlanned);
    const amountActual = transaction.amountActual ? decimalToNumber(transaction.amountActual) : null;
    const cardSettledAmount = transaction.cardSettledAmount
      ? decimalToNumber(transaction.cardSettledAmount)
      : 0;
    const resolvedAmount = this.resolveRowAmount({
      amountPlanned,
      amountActual,
      status: transaction.status
    });

    const splits = this.normalizeCardSplits(transaction, resolvedAmount);
    const ownAmount = transaction.type === "EXPENSE"
      ? splits
          .filter((split) => split.ownerType === "SELF")
          .reduce((sum, split) => sum + split.amount, 0)
      : 0;
    const thirdPartyAmount = transaction.type === "EXPENSE"
      ? splits
          .filter((split) => split.ownerType === "THIRD_PARTY")
          .reduce((sum, split) => sum + split.amount, 0)
      : 0;
    const thirdPartyReceived = transaction.type === "EXPENSE"
      ? splits
          .filter((split) => split.ownerType === "THIRD_PARTY" && !!split.receivedAt)
          .reduce((sum, split) => sum + split.amount, 0)
      : 0;
    const thirdPartyPending = Math.max(0, thirdPartyAmount - thirdPartyReceived);

    return {
      id: transaction.id,
      description: transaction.description,
      type: transaction.type,
      status: transaction.status,
      behavior: transaction.behavior,
      dueDate: transaction.dueDate.toISOString(),
      amountPlanned,
      amountActual,
      cardSettledAmount: Number(cardSettledAmount.toFixed(2)),
      cardOwnership: transaction.cardOwnership ?? "SELF",
      thirdPartyReceivedAt: transaction.thirdPartyReceivedAt?.toISOString() ?? null,
      ownAmount: Number(ownAmount.toFixed(2)),
      thirdPartyAmount: Number(thirdPartyAmount.toFixed(2)),
      thirdPartyReceived: Number(thirdPartyReceived.toFixed(2)),
      thirdPartyPending: Number(thirdPartyPending.toFixed(2)),
      splits,
      category: transaction.category,
      account: transaction.account,
      party: transaction.party ?? null,
      resolvedAmount: Number(resolvedAmount.toFixed(2))
    };
  }

  private normalizeCardSplits(
    transaction: {
      id: string;
      type: "INCOME" | "EXPENSE";
      amountPlanned: Prisma.Decimal;
      cardOwnership?: "SELF" | "THIRD_PARTY";
      thirdPartyReceivedAt?: Date | null;
      party?: { id: string; name: string } | null;
      cardSplits?: Array<{
        id: string;
        ownerType: "SELF" | "THIRD_PARTY";
        amount: Prisma.Decimal;
        partyId: string | null;
        party?: { id: string; name: string } | null;
        receivedAt: Date | null;
      }>;
    },
    resolvedAmount: number
  ): CardSplitView[] {
    if (transaction.type !== "EXPENSE") {
      return [];
    }

    const plannedAmount = decimalToNumber(transaction.amountPlanned);
    const factor = plannedAmount > 0 ? resolvedAmount / plannedAmount : 0;

    if (transaction.cardSplits && transaction.cardSplits.length > 0) {
      return transaction.cardSplits.map((split) => {
        const baseAmount = decimalToNumber(split.amount);
        const scaledAmount = Number((baseAmount * factor).toFixed(2));
        return {
          id: split.id,
          ownerType: split.ownerType,
          amount: scaledAmount,
          partyId: split.partyId ?? null,
          partyName: split.party?.name ?? null,
          receivedAt: split.receivedAt?.toISOString() ?? null
        };
      });
    }

    return [
      {
        id: `legacy-split-${transaction.id}`,
        ownerType: transaction.cardOwnership ?? "SELF",
        amount: Number(resolvedAmount.toFixed(2)),
        partyId: transaction.party?.id ?? null,
        partyName: transaction.party?.name ?? null,
        receivedAt: transaction.thirdPartyReceivedAt?.toISOString() ?? null
      }
    ];
  }

  private toPublicCardStatementRow(row: CardStatementRowInternal) {
    const { resolvedAmount: _resolvedAmount, ...publicRow } = row;
    return publicRow;
  }

  private mapTransaction(
    transaction: {
      id: string;
      description: string;
      type: "INCOME" | "EXPENSE";
      status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
      behavior: "FIXED" | "VARIABLE" | "PROVISION";
      dueDate: Date;
      amountPlanned: { toString(): string };
      amountActual: { toString(): string } | null;
      cardSettledAmount?: { toString(): string } | number | null;
      cardOwnership?: "SELF" | "THIRD_PARTY";
      thirdPartyReceivedAt?: Date | string | null;
      transferAccountId?: string | null;
      transferGroupId?: string | null;
      source?: "MANUAL" | "RECURRENCE" | "IMPORT";
      externalHash?: string | null;
      reconciledAt?: Date | string | null;
      party?: { id: string; name: string } | null;
      category: { id: string; name: string; color: string };
      account: { id: string; name: string; type: "BANK_ACCOUNT" | "CASH" | "CREDIT_CARD" };
      installmentNumber?: number | null;
      installmentTotal?: number | null;
      createdAt?: Date;
      updatedAt?: Date;
      [key: string]: unknown;
    }
  ) {
    return {
      ...transaction,
      dueDate: transaction.dueDate.toISOString(),
      amountPlanned: decimalToNumber(transaction.amountPlanned as unknown as number),
      amountActual: transaction.amountActual ? decimalToNumber(transaction.amountActual as unknown as number) : null,
      cardSettledAmount:
        transaction.cardSettledAmount !== undefined && transaction.cardSettledAmount !== null
          ? decimalToNumber(transaction.cardSettledAmount as unknown as number)
          : 0,
      thirdPartyReceivedAt:
        transaction.thirdPartyReceivedAt instanceof Date
          ? transaction.thirdPartyReceivedAt.toISOString()
          : transaction.thirdPartyReceivedAt ?? null,
      reconciledAt:
        transaction.reconciledAt instanceof Date
          ? transaction.reconciledAt.toISOString()
          : transaction.reconciledAt ?? null
    };
  }
}
