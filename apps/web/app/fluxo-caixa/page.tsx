"use client";

import { useQuery } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth, subDays } from "date-fns";
import { CalendarRange, ChartNoAxesCombined, WalletCards } from "lucide-react";
import { useMemo, useState } from "react";
import { CashflowChart } from "../../components/cashflow/cashflow-chart";
import { CashflowTable } from "../../components/cashflow/cashflow-table";
import { Button } from "../../components/ui/button";
import { Card, CardDescription, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import { getCashflow, getDayTransactions } from "../../lib/api/endpoints";
import { formatCurrency, formatDate } from "../../lib/utils/format";

export default function FluxoCaixaPage() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const cashflowQuery = useQuery({
    queryKey: ["cashflow", startDate, endDate],
    queryFn: () => getCashflow({ startDate, endDate })
  });

  const dayQuery = useQuery({
    queryKey: ["cashflow-day", selectedDate],
    queryFn: () => getDayTransactions(selectedDate!),
    enabled: !!selectedDate
  });

  const rows = cashflowQuery.data?.rows ?? [];

  const summary = useMemo(() => {
    const totalIncomes = rows.reduce((sum, row) => sum + row.incomes, 0);
    const totalExpenses = rows.reduce((sum, row) => sum + row.expenses, 0);
    const negativeDays = rows.filter((row) => row.alert === "NEGATIVE").length;
    const finalBalance = rows[rows.length - 1]?.cumulativeBalance ?? 0;
    return { totalIncomes, totalExpenses, negativeDays, finalBalance };
  }, [rows]);

  const applyPreset = (days: number) => {
    const today = new Date();
    setStartDate(format(subDays(today, days - 1), "yyyy-MM-dd"));
    setEndDate(format(today, "yyyy-MM-dd"));
    setSelectedDate(null);
  };

  return (
    <section className="space-y-4">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">Periodo de analise</CardTitle>
            <CardDescription className="mt-1">
              Clique em um dia da tabela para abrir os lancamentos do dia.
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => applyPreset(7)}>
              Ultimos 7 dias
            </Button>
            <Button variant="secondary" size="sm" onClick={() => applyPreset(30)}>
              Ultimos 30 dias
            </Button>
            <Button variant="secondary" size="sm" onClick={() => applyPreset(90)}>
              Ultimos 90 dias
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm">Data inicial</label>
            <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Data final</label>
            <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>
          <div className="flex items-end">
            <div className="w-full rounded-xl border border-border bg-surface-soft px-3 py-2 text-sm text-muted">
              <div className="mb-1 flex items-center gap-1">
                <CalendarRange size={14} />
                Periodo selecionado
              </div>
              {formatDate(startDate)} ate {formatDate(endDate)}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-success/25 bg-success/10">
          <CardDescription>Entradas no periodo</CardDescription>
          <CardTitle className="mt-1 text-2xl">{formatCurrency(summary.totalIncomes)}</CardTitle>
        </Card>
        <Card className="border-danger/25 bg-danger/10">
          <CardDescription>Saidas no periodo</CardDescription>
          <CardTitle className="mt-1 text-2xl">{formatCurrency(summary.totalExpenses)}</CardTitle>
        </Card>
        <Card className="border-brand/25 bg-brand/10">
          <CardDescription>Saldo acumulado final</CardDescription>
          <CardTitle className="mt-1 text-2xl">{formatCurrency(summary.finalBalance)}</CardTitle>
        </Card>
        <Card className={summary.negativeDays > 0 ? "border-warning/25 bg-warning/10" : "border-success/25 bg-success/10"}>
          <CardDescription>Dias em alerta</CardDescription>
          <CardTitle className="mt-1 text-2xl">{summary.negativeDays}</CardTitle>
        </Card>
      </div>

      {selectedDate ? (
        <Card className="border-brand/25 bg-brand/10">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              Dia selecionado: <strong>{formatDate(selectedDate)}</strong>
            </p>
            <Button variant="secondary" size="sm" onClick={() => setSelectedDate(null)}>
              Limpar selecao
            </Button>
          </div>
        </Card>
      ) : null}

      {cashflowQuery.isLoading ? (
        <Skeleton className="h-[320px] w-full" />
      ) : (
        <CashflowChart data={rows} />
      )}

      {cashflowQuery.isLoading ? (
        <Skeleton className="h-[420px] w-full" />
      ) : (
        <CashflowTable
          rows={rows}
          selectedDate={selectedDate}
          onSelectDay={(date) => setSelectedDate(date || null)}
          dayRows={dayQuery.data ?? []}
          dayLoading={dayQuery.isLoading}
        />
      )}

      <Card className="border-border/70 bg-surface-soft/60">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <ChartNoAxesCombined size={15} />
          Dica: acompanhe os dias em alerta e ajuste os lancamentos pendentes antes do vencimento.
          <WalletCards size={15} className="ml-1" />
        </div>
      </Card>
    </section>
  );
}
