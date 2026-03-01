"use client";

import { Badge } from "../ui/badge";
import { Card, CardDescription, CardTitle } from "../ui/card";
import { formatCurrency } from "../../lib/utils/format";
import { formatBehavior, formatStatus, formatType } from "../../lib/utils/i18n";

type Row = {
  id: string;
  description: string;
  type: "INCOME" | "EXPENSE";
  status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
  behavior: "FIXED" | "VARIABLE" | "PROVISION";
  amountPlanned: number;
  amountActual: number | null;
  category: { name: string };
  account: { name: string };
  isProjected?: boolean;
};

export function DayTransactions({ date, rows }: { date: string; rows: Row[] }) {
  if (!date) {
    return (
      <Card>
        <CardTitle>Selecione um dia</CardTitle>
        <CardDescription>Clique em uma linha da tabela para listar os lançamentos do dia.</CardDescription>
      </Card>
    );
  }

  return (
    <Card>
      <CardTitle>
        Lançamentos do dia {new Intl.DateTimeFormat("pt-BR").format(new Date(`${date}T00:00:00`))}
      </CardTitle>
      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <CardDescription>Nenhum lançamento encontrado para este dia.</CardDescription>
        ) : (
          rows.map((row) => (
            <div key={row.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{row.description}</p>
                <p className={row.type === "INCOME" ? "text-success" : "text-danger"}>
                  {formatCurrency(row.amountActual ?? row.amountPlanned)}
                </p>
              </div>
              <p className="text-xs text-muted">
                {row.account.name} | {row.category.name} | {formatType(row.type)} | {formatBehavior(row.behavior)}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge tone={row.status === "PENDING" ? "warning" : row.status === "CANCELED" ? "danger" : "success"}>
                  {formatStatus(row.status)}
                </Badge>
                {row.isProjected ? <Badge tone="neutral">Projetado</Badge> : null}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
