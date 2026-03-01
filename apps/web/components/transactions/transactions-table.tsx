"use client";

import { createColumnHelper } from "@tanstack/react-table";
import { Ban, CheckCircle2, Pencil } from "lucide-react";
import { DataTable } from "../shared/data-table";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { formatCurrency, formatDate } from "../../lib/utils/format";
import { formatBehavior, formatStatus, formatType } from "../../lib/utils/i18n";

export type TransactionRow = {
  id: string;
  description: string;
  type: "INCOME" | "EXPENSE";
  status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
  behavior: "FIXED" | "VARIABLE" | "PROVISION";
  dueDate: string;
  amountPlanned: number;
  amountActual: number | null;
  cardSettledAmount?: number;
  category: { name: string };
  account: { name: string; type: string };
  transferGroupId?: string | null;
  transferAccountId?: string | null;
  cardOwnership?: "SELF" | "THIRD_PARTY";
  thirdPartyReceivedAt?: string | null;
  party?: { id: string; name: string } | null;
  installmentNumber?: number | null;
  installmentTotal?: number | null;
  source?: "MANUAL" | "RECURRENCE" | "IMPORT";
};

const column = createColumnHelper<TransactionRow>();

function statusTone(status: TransactionRow["status"]) {
  if (status === "PENDING") return "warning";
  if (status === "CANCELED") return "danger";
  return "success";
}

export function TransactionsTable({
  rows,
  onEffectivate,
  onEdit,
  onCancel,
  showSearch = true
}: {
  rows: TransactionRow[];
  onEffectivate: (row: TransactionRow) => void;
  onEdit: (row: TransactionRow) => void;
  onCancel: (row: TransactionRow) => void;
  showSearch?: boolean;
}) {
  return (
    <DataTable
      data={rows}
      searchPlaceholder="Buscar por descricao, conta ou categoria"
      showGlobalFilter={showSearch}
      emptyMessage="Nenhum lancamento encontrado."
      columns={[
        column.accessor("description", {
          header: "Descricao",
          cell: (info) => (
            <div className="space-y-1">
              <p className="font-semibold">{info.getValue()}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {info.row.original.installmentNumber && info.row.original.installmentTotal ? (
                  <Badge tone="neutral">
                    Parcela {info.row.original.installmentNumber}/{info.row.original.installmentTotal}
                  </Badge>
                ) : null}
                {info.row.original.transferGroupId ? <Badge tone="neutral">Transferencia</Badge> : null}
                {info.row.original.source === "RECURRENCE" ? <Badge tone="neutral">Recorrencia</Badge> : null}
                {info.row.original.source === "IMPORT" ? <Badge tone="neutral">Importacao</Badge> : null}
              </div>
            </div>
          )
        }),
        column.accessor("type", {
          header: "Tipo",
          cell: (info) => (
            <Badge tone={info.getValue() === "INCOME" ? "success" : "danger"}>
              {formatType(info.getValue())}
            </Badge>
          )
        }),
        column.accessor("status", {
          header: "Status",
          cell: (info) => <Badge tone={statusTone(info.getValue())}>{formatStatus(info.getValue())}</Badge>
        }),
        column.accessor("behavior", {
          header: "Comportamento",
          cell: (info) => formatBehavior(info.getValue())
        }),
        column.accessor("dueDate", {
          header: "Vencimento",
          cell: (info) => formatDate(info.getValue().slice(0, 10))
        }),
        column.accessor("amountPlanned", {
          header: "Valor previsto",
          cell: (info) => formatCurrency(info.getValue())
        }),
        column.accessor("amountActual", {
          header: "Valor pago/recebido",
          cell: (info) => {
            const row = info.row.original;
            if (row.account.type === "CREDIT_CARD") {
              if (!row.cardSettledAmount || row.cardSettledAmount <= 0) {
                return <span className="text-muted">--</span>;
              }
              return formatCurrency(row.cardSettledAmount);
            }
            if (row.status !== "PAID" && row.status !== "RECEIVED") {
              return <span className="text-muted">--</span>;
            }
            return formatCurrency(info.getValue() ?? row.amountPlanned);
          }
        }),
        column.display({
          id: "conta",
          header: "Conta",
          cell: (info) => info.row.original.account.name
        }),
        column.display({
          id: "categoria",
          header: "Categoria",
          cell: (info) => info.row.original.category.name
        }),
        column.display({
          id: "acoes",
          header: "Acoes",
          enableSorting: false,
          cell: (info) => {
            const isCreditCard = info.row.original.account.type === "CREDIT_CARD";
            return (
              <div className="flex items-center gap-1">
                {isCreditCard ? (
                  <Badge tone="neutral">Pago via fatura</Badge>
                ) : (
                  <Button
                    size="icon"
                    variant="secondary"
                    disabled={info.row.original.status !== "PENDING"}
                    onClick={() => onEffectivate(info.row.original)}
                    title="Efetivar"
                    aria-label="Efetivar"
                  >
                    <CheckCircle2 size={15} />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="secondary"
                  disabled={info.row.original.status !== "PENDING"}
                  onClick={() => onEdit(info.row.original)}
                  title="Editar"
                  aria-label="Editar"
                >
                  <Pencil size={15} />
                </Button>
                <Button
                  size="icon"
                  variant="danger"
                  disabled={info.row.original.status === "CANCELED"}
                  onClick={() => onCancel(info.row.original)}
                  title="Cancelar"
                  aria-label="Cancelar"
                >
                  <Ban size={15} />
                </Button>
              </div>
            );
          }
        })
      ]}
    />
  );
}
