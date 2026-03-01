"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardDescription, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import {
  commitImportedTransactions,
  getAccounts,
  getCategories,
  previewImportedTransactions
} from "../../lib/api/endpoints";

type PreviewRow = {
  rowNumber: number;
  date: string;
  description: string;
  amount: number;
  type: "INCOME" | "EXPENSE";
  sourceFormat?: "CSV" | "OFX";
  externalRef?: string;
  memo?: string;
  bankId?: string;
  accountRef?: string;
  categoryId?: string;
  suggestedCategoryId?: string;
  suggestionConfidence?: number;
  isTransfer?: boolean;
  transferAccountId?: string;
  status: "VALID" | "DUPLICATE" | "INVALID";
  duplicateOfTransactionId?: string;
  suggestedReconcileTransactionId?: string;
  errors: string[];
  hash: string;
};

const CATEGORY_REQUIRED_ERROR = "Categoria obrigatoria.";
const TRANSFER_ACCOUNT_REQUIRED_ERROR = "Conta de transferencia obrigatoria.";

function detectInputFormat(fileName: string, content: string): "CSV" | "OFX" {
  const lowerName = fileName.toLowerCase();
  if (lowerName.endsWith(".ofx") || lowerName.endsWith(".qfx")) {
    return "OFX";
  }

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

function getEffectiveCategoryId(row: PreviewRow) {
  return row.categoryId ?? row.suggestedCategoryId;
}

function getBlockingErrors(row: PreviewRow) {
  const baseErrors = row.errors.filter((error) => error !== CATEGORY_REQUIRED_ERROR);
  if (row.isTransfer && !row.transferAccountId) {
    return [...baseErrors, TRANSFER_ACCOUNT_REQUIRED_ERROR];
  }
  if (!row.isTransfer && !getEffectiveCategoryId(row)) {
    return [...baseErrors, CATEGORY_REQUIRED_ERROR];
  }
  return baseErrors;
}

function getResolvedStatus(row: PreviewRow): "VALID" | "DUPLICATE" | "INVALID" {
  if (row.status === "DUPLICATE") return "DUPLICATE";
  return getBlockingErrors(row).length === 0 ? "VALID" : "INVALID";
}

function isRowCommittable(row: PreviewRow) {
  return getResolvedStatus(row) === "VALID";
}

export default function ImportacoesPage() {
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({ queryKey: ["accounts-import"], queryFn: getAccounts });
  const categoriesQuery = useQuery({ queryKey: ["categories-import"], queryFn: getCategories });

  const [fileName, setFileName] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [inputFormat, setInputFormat] = useState<"CSV" | "OFX">("CSV");
  const [accountId, setAccountId] = useState("");
  const [defaultCategoryId, setDefaultCategoryId] = useState("");
  const [delimiter, setDelimiter] = useState<"," | ";" | "\t">(";");
  const [hasHeader, setHasHeader] = useState(true);
  const [defaultType, setDefaultType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [defaultBehavior, setDefaultBehavior] = useState<"FIXED" | "VARIABLE" | "PROVISION">("VARIABLE");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "VALID" | "DUPLICATE" | "INVALID">("ALL");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | "WITH_CATEGORY" | "WITHOUT_CATEGORY">("ALL");
  const [batchCategoryId, setBatchCategoryId] = useState("");
  const [editableRows, setEditableRows] = useState<PreviewRow[]>([]);

  const previewMutation = useMutation({
    mutationFn: () =>
      previewImportedTransactions({
        inputFormat,
        fileName: fileName || (inputFormat === "OFX" ? "importacao.ofx" : "importacao.csv"),
        fileContent,
        delimiter: inputFormat === "CSV" ? delimiter : undefined,
        hasHeader: inputFormat === "CSV" ? hasHeader : undefined,
        accountId,
        defaultType,
        defaultBehavior,
        defaultStatus: "PENDING",
        defaultCategoryId: defaultCategoryId || undefined
      })
  });

  useEffect(() => {
    setEditableRows((previewMutation.data?.rows ?? []) as PreviewRow[]);
  }, [previewMutation.data]);

  const commitMutation = useMutation({
    mutationFn: () => {
      const validRows = editableRows.filter((row) => isRowCommittable(row));
      return commitImportedTransactions({
        fileName: fileName || (inputFormat === "OFX" ? "importacao.ofx" : "importacao.csv"),
        accountId,
        rows: validRows.map((row) => ({
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
          isTransfer: !!row.isTransfer,
          transferAccountId: row.transferAccountId
        })),
        dedupe: true,
        reconcileMatches: true,
        defaultBehavior,
        defaultStatus: "PENDING",
        source: "IMPORT"
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      await queryClient.invalidateQueries({ queryKey: ["reports-dashboard"] });
      await queryClient.invalidateQueries({ queryKey: ["budget-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["budget-alerts"] });
    }
  });

  const categoriesById = useMemo(
    () =>
      new Map((categoriesQuery.data ?? []).map((category) => [category.id, category.name])),
    [categoriesQuery.data]
  );

  const committableRows = useMemo(() => editableRows.filter((row) => isRowCommittable(row)), [editableRows]);

  const rowStats = useMemo(() => {
    let valid = 0;
    let duplicate = 0;
    let invalid = 0;
    for (const row of editableRows) {
      const status = getResolvedStatus(row);
      if (status === "VALID") valid += 1;
      if (status === "DUPLICATE") duplicate += 1;
      if (status === "INVALID") invalid += 1;
    }
    return { valid, duplicate, invalid };
  }, [editableRows]);

  const filteredRows = useMemo(
    () =>
      editableRows.filter((row) => {
        const resolvedStatus = getResolvedStatus(row);
        if (statusFilter !== "ALL" && resolvedStatus !== statusFilter) {
          return false;
        }

        const effectiveCategoryId = getEffectiveCategoryId(row);
        if (categoryFilter === "WITH_CATEGORY" && !effectiveCategoryId && !row.isTransfer) {
          return false;
        }
        if (categoryFilter === "WITHOUT_CATEGORY" && (!!effectiveCategoryId || row.isTransfer)) {
          return false;
        }

        return true;
      }),
    [editableRows, statusFilter, categoryFilter]
  );

  const isInitialLoading = accountsQuery.isLoading || categoriesQuery.isLoading;

  if (isInitialLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-[110px] w-full" />
        <Skeleton className="h-[260px] w-full" />
        <Skeleton className="h-[420px] w-full" />
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <Card>
        <CardTitle>Importacao inteligente (CSV / OFX)</CardTitle>
        <CardDescription className="mt-1">
          Upload, preview com sugestao de categoria e confirmacao em lote.
        </CardDescription>
      </Card>

      <Card className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm">Arquivo</label>
          <Input
            type="file"
            accept=".csv,.ofx,.qfx,text/csv,application/xml,text/xml"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;

              setFileName(file.name);
              file.text().then((content) => {
                setFileContent(content);
                setInputFormat(detectInputFormat(file.name, content));
              });
            }}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm">Formato de entrada</label>
          <Select value={inputFormat} onChange={(event) => setInputFormat(event.target.value as "CSV" | "OFX")}>
            <option value="CSV">CSV</option>
            <option value="OFX">OFX</option>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-sm">Conta de destino</label>
          <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            <option value="">Selecione</option>
            {(accountsQuery.data ?? []).map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-sm">Categoria padrao</label>
          <Select value={defaultCategoryId} onChange={(event) => setDefaultCategoryId(event.target.value)}>
            <option value="">Sem padrao</option>
            {(categoriesQuery.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-sm">Tipo padrao</label>
          <Select value={defaultType} onChange={(event) => setDefaultType(event.target.value as "INCOME" | "EXPENSE")}>
            <option value="EXPENSE">Saida</option>
            <option value="INCOME">Entrada</option>
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-sm">Comportamento padrao</label>
          <Select
            value={defaultBehavior}
            onChange={(event) =>
              setDefaultBehavior(event.target.value as "FIXED" | "VARIABLE" | "PROVISION")
            }
          >
            <option value="VARIABLE">Variavel</option>
            <option value="FIXED">Fixo</option>
            <option value="PROVISION">Provisao</option>
          </Select>
        </div>
        {inputFormat === "CSV" ? (
          <>
            <div>
              <label className="mb-1 block text-sm">Delimitador</label>
              <Select value={delimiter} onChange={(event) => setDelimiter(event.target.value as "," | ";" | "\t")}>
                <option value=";">Ponto e virgula (;)</option>
                <option value=",">Virgula (,)</option>
                <option value="\t">Tabulacao</option>
              </Select>
            </div>
            <label className="inline-flex items-center gap-2 text-sm xl:pt-7">
              <input type="checkbox" checked={hasHeader} onChange={(event) => setHasHeader(event.target.checked)} />
              Arquivo possui cabecalho
            </label>
          </>
        ) : null}
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => previewMutation.mutate()}
          disabled={!fileContent || !accountId || previewMutation.isPending}
        >
          {previewMutation.isPending ? "Processando..." : "Gerar preview"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => commitMutation.mutate()}
          disabled={committableRows.length === 0 || commitMutation.isPending}
        >
          {commitMutation.isPending ? "Importando..." : `Confirmar importacao (${committableRows.length})`}
        </Button>
      </div>

      {previewMutation.isPending ? (
        <Card className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-[240px] w-full" />
        </Card>
      ) : null}

      {previewMutation.error ? (
        <Card>
          <p className="text-sm text-danger">
            {previewMutation.error instanceof Error ? previewMutation.error.message : "Falha no preview."}
          </p>
        </Card>
      ) : null}

      {previewMutation.data ? (
        <Card className="space-y-3">
          <div className="grid gap-2 md:grid-cols-5">
            <p className="text-sm">Total: {editableRows.length}</p>
            <p className="text-sm text-success">Validas: {rowStats.valid}</p>
            <p className="text-sm text-warning">Duplicadas: {rowStats.duplicate}</p>
            <p className="text-sm text-danger">Invalidas: {rowStats.invalid}</p>
            <p className="text-sm">Formato: {previewMutation.data.inputFormat}</p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs text-muted">Filtrar por status</label>
              <Select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "ALL" | "VALID" | "DUPLICATE" | "INVALID")}
              >
                <option value="ALL">Todos</option>
                <option value="VALID">Validos</option>
                <option value="DUPLICATE">Duplicados</option>
                <option value="INVALID">Invalidos</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Filtrar por categoria</label>
              <Select
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value as "ALL" | "WITH_CATEGORY" | "WITHOUT_CATEGORY")}
              >
                <option value="ALL">Todos</option>
                <option value="WITH_CATEGORY">Com categoria</option>
                <option value="WITHOUT_CATEGORY">Sem categoria</option>
              </Select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted">Categoria em lote</label>
              <Select value={batchCategoryId} onChange={(event) => setBatchCategoryId(event.target.value)}>
                <option value="">Selecione</option>
                {(categoriesQuery.data ?? []).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="self-end">
              <Button
                variant="secondary"
                className="w-full"
                disabled={!batchCategoryId}
                onClick={() =>
                  setEditableRows((rows) =>
                    rows.map((row) => {
                      const resolvedStatus = getResolvedStatus(row);
                      if (statusFilter !== "ALL" && resolvedStatus !== statusFilter) return row;
                      if (row.status === "DUPLICATE" || row.isTransfer) return row;
                      return { ...row, categoryId: batchCategoryId };
                    })
                  )
                }
              >
                Aplicar em lote
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1240px] text-sm">
              <thead className="border-b border-border bg-surface-soft text-left">
                <tr>
                  <th className="px-3 py-2">Linha</th>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Descricao</th>
                  <th className="px-3 py-2">Valor</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2">Classificacao</th>
                  <th className="px-3 py-2">Conta de transferencia</th>
                  <th className="px-3 py-2">Categoria</th>
                  <th className="px-3 py-2">Sugestao</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Erros</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const effectiveCategoryId = getEffectiveCategoryId(row);
                  const blockingErrors = getBlockingErrors(row);
                  const resolvedStatus = getResolvedStatus(row);
                  const isDuplicate = row.status === "DUPLICATE";
                  const suggestionName = !row.isTransfer && row.suggestedCategoryId
                    ? categoriesById.get(row.suggestedCategoryId) ?? row.suggestedCategoryId
                    : null;
                  const confidence = row.suggestionConfidence !== undefined
                    ? `${Math.round(row.suggestionConfidence * 100)}%`
                    : "--";

                  return (
                    <tr key={`${row.rowNumber}-${row.hash}`} className="border-b border-border/70">
                      <td className="px-3 py-2">{row.rowNumber}</td>
                      <td className="px-3 py-2">{row.date}</td>
                      <td className="px-3 py-2">{row.description}</td>
                      <td className="px-3 py-2">{row.amount.toFixed(2)}</td>
                      <td className="px-3 py-2">{row.type === "INCOME" ? "Entrada" : "Saida"}</td>
                      <td className="px-3 py-2">
                        <Select
                          value={row.isTransfer ? "TRANSFER" : "TRANSACTION"}
                          onChange={(event) =>
                            setEditableRows((rows) =>
                              rows.map((item) =>
                                item.hash === row.hash && item.rowNumber === row.rowNumber
                                  ? {
                                      ...item,
                                      isTransfer: event.target.value === "TRANSFER",
                                      transferAccountId:
                                        event.target.value === "TRANSFER"
                                          ? item.transferAccountId
                                          : undefined,
                                      categoryId:
                                        event.target.value === "TRANSFER"
                                          ? undefined
                                          : item.categoryId
                                    }
                                  : item
                              )
                            )
                          }
                          disabled={isDuplicate}
                        >
                          <option value="TRANSACTION">Lancamento normal</option>
                          <option value="TRANSFER">Transferencia</option>
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={row.transferAccountId ?? ""}
                          onChange={(event) =>
                            setEditableRows((rows) =>
                              rows.map((item) =>
                                item.hash === row.hash && item.rowNumber === row.rowNumber
                                  ? { ...item, transferAccountId: event.target.value || undefined }
                                  : item
                              )
                            )
                          }
                          disabled={!row.isTransfer || isDuplicate}
                        >
                          <option value="">Selecione</option>
                          {(accountsQuery.data ?? [])
                            .filter((account) => account.id !== accountId)
                            .map((account) => (
                              <option key={account.id} value={account.id}>
                                {account.name}
                              </option>
                            ))}
                        </Select>
                      </td>
                      <td className="px-3 py-2">
                        <Select
                          value={row.categoryId ?? ""}
                          onChange={(event) =>
                            setEditableRows((rows) =>
                              rows.map((item) =>
                                item.hash === row.hash && item.rowNumber === row.rowNumber
                                  ? { ...item, categoryId: event.target.value || undefined }
                                  : item
                              )
                            )
                          }
                          disabled={isDuplicate || !!row.isTransfer}
                        >
                          <option value="">Selecione</option>
                          {(categoriesQuery.data ?? []).map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </Select>
                        {!row.isTransfer && !row.categoryId && effectiveCategoryId ? (
                          <p className="mt-1 text-xs text-muted">
                            Sugestao aplicada: {categoriesById.get(effectiveCategoryId) ?? effectiveCategoryId}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {suggestionName ? (
                          <>
                            <p>{suggestionName}</p>
                            <p className="text-muted">Confianca: {confidence}</p>
                          </>
                        ) : (
                          <span className="text-muted">Sem sugestao</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          tone={
                            resolvedStatus === "VALID"
                              ? "success"
                              : resolvedStatus === "DUPLICATE"
                                ? "warning"
                                : "danger"
                          }
                        >
                          {resolvedStatus}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {blockingErrors.length > 0 ? (
                          <span className="text-danger">{blockingErrors.join(" | ")}</span>
                        ) : (
                          <span className="text-muted">--</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      {commitMutation.data ? (
        <Card>
          <CardTitle>Importacao concluida</CardTitle>
          <CardDescription className="mt-2">
            Lote: {commitMutation.data.batchId} | Importados: {commitMutation.data.importedCount} | Pulados:{" "}
            {commitMutation.data.skippedCount} | Reconciliados: {commitMutation.data.reconciledCount}
          </CardDescription>
        </Card>
      ) : null}
    </section>
  );
}
