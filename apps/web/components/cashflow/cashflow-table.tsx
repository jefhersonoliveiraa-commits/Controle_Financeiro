"use client";

import { Badge } from "../ui/badge";
import { Card } from "../ui/card";
import { formatCurrency, formatDate } from "../../lib/utils/format";
import { cn } from "../../lib/utils/cn";
import { formatBehavior, formatStatus, formatType } from "../../lib/utils/i18n";
import { Fragment } from "react";

type CashflowRow = {
  date: string;
  incomes: number;
  expenses: number;
  dayBalance: number;
  cumulativeBalance: number;
  alert: "NEGATIVE" | "LIMIT" | "OK";
};

type DayTransactionRow = {
  id: string;
  description: string;
  type: "INCOME" | "EXPENSE";
  status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
  behavior: "FIXED" | "VARIABLE" | "PROVISION";
  amountPlanned: number;
  amountActual: number | null;
  account: { name: string };
  category: { name: string };
  isProjected?: boolean;
};

export function CashflowTable({
  rows,
  selectedDate,
  onSelectDay,
  dayRows = [],
  dayLoading = false
}: {
  rows: CashflowRow[];
  selectedDate?: string | null;
  dayRows?: DayTransactionRow[];
  dayLoading?: boolean;
  onSelectDay: (date: string) => void;
}) {
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[680px] text-sm md:min-w-[780px]">
        <thead className="border-b border-border bg-surface-soft text-left">
          <tr>
            <th className="px-3 py-2">Data</th>
            <th className="px-3 py-2">Entradas previstas</th>
            <th className="px-3 py-2">Saídas previstas</th>
            <th className="px-3 py-2">Saldo do dia</th>
            <th className="px-3 py-2">Saldo acumulado</th>
            <th className="px-3 py-2">Alerta</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSelected = selectedDate === row.date;
            return (
              <Fragment key={row.date}>
                <tr
                  onClick={() => onSelectDay(isSelected ? "" : row.date)}
                  className={cn(
                    "cursor-pointer border-b border-border/70 transition hover:bg-surface-soft/70",
                    isSelected ? "bg-brand/10" : ""
                  )}
                >
                  <td className="px-3 py-2 font-medium">{formatDate(row.date)}</td>
                  <td className="px-3 py-2 text-success">{formatCurrency(row.incomes)}</td>
                  <td className="px-3 py-2 text-danger">{formatCurrency(row.expenses)}</td>
                  <td className={cn("px-3 py-2", row.dayBalance < 0 ? "text-danger" : "text-success")}>
                    {formatCurrency(row.dayBalance)}
                  </td>
                  <td className={cn("px-3 py-2", row.cumulativeBalance < 0 ? "text-danger font-semibold" : "")}>
                    {formatCurrency(row.cumulativeBalance)}
                  </td>
                  <td className="px-3 py-2">
                    {row.alert === "NEGATIVE" ? (
                      <Badge tone="danger">Saldo negativo</Badge>
                    ) : row.alert === "LIMIT" ? (
                      <Badge tone="warning">No limite</Badge>
                    ) : (
                      <Badge tone="success">OK</Badge>
                    )}
                  </td>
                </tr>
                {isSelected ? (
                  <tr className="border-b border-border/70 bg-surface-soft/70">
                    <td colSpan={6} className="px-3 py-3">
                      <div className="rounded-xl border border-border bg-surface p-3">
                        <p className="mb-2 text-sm font-semibold">
                          Lançamentos de {formatDate(row.date)}
                        </p>
                        {dayLoading ? (
                          <p className="text-sm text-muted">Carregando lançamentos...</p>
                        ) : dayRows.length === 0 ? (
                          <p className="text-sm text-muted">Nenhum lançamento para este dia.</p>
                        ) : (
                          <div className="space-y-2">
                            {dayRows.map((item) => (
                              <div key={item.id} className="rounded-lg border border-border p-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="font-medium">{item.description}</p>
                                  <p className={item.type === "INCOME" ? "text-success" : "text-danger"}>
                                    {formatCurrency(item.amountActual ?? item.amountPlanned)}
                                  </p>
                                </div>
                                <p className="text-xs text-muted">
                                  {item.account.name} | {item.category.name} | {formatType(item.type)} |{" "}
                                  {formatBehavior(item.behavior)}
                                </p>
                                <div className="mt-2 flex gap-2">
                                  <Badge tone={item.status === "PENDING" ? "warning" : "success"}>
                                    {formatStatus(item.status)}
                                  </Badge>
                                  {item.isProjected ? <Badge tone="neutral">Projetado</Badge> : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
