"use client";

import { useQuery } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Button } from "../../components/ui/button";
import { Card, CardDescription, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Skeleton } from "../../components/ui/skeleton";
import {
  downloadTransactionsCsv,
  downloadTransactionsXlsx,
  getReportsHealth,
  getReportsSummary
} from "../../lib/api/endpoints";
import { formatCurrency, formatDate } from "../../lib/utils/format";

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function RelatoriosPage() {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [monthReference, setMonthReference] = useState(format(new Date(), "yyyy-MM"));

  const applyMonthRange = (value: string) => {
    if (!value) return;
    const monthDate = new Date(`${value}-01T12:00:00`);
    if (Number.isNaN(monthDate.getTime())) return;

    setMonthReference(value);
    setStartDate(format(startOfMonth(monthDate), "yyyy-MM-dd"));
    setEndDate(format(endOfMonth(monthDate), "yyyy-MM-dd"));
  };

  const applyRelativeMonth = (monthsAgo: number) => {
    const base = subMonths(new Date(), monthsAgo);
    applyMonthRange(format(base, "yyyy-MM"));
  };

  const query = useQuery({
    queryKey: ["reports", startDate, endDate],
    queryFn: () => getReportsSummary({ startDate, endDate })
  });
  const healthQuery = useQuery({
    queryKey: ["reports-health", startDate, endDate],
    queryFn: () => getReportsHealth({ startDate, endDate })
  });

  const data = query.data;
  const categoryRows = useMemo(() => {
    if (!data) return [];
    const categories = new Set([
      ...data.byCategoryExpenses.map((item) => item.category),
      ...data.byCategoryIncomes.map((item) => item.category)
    ]);
    return Array.from(categories).map((category) => {
      const totalDespesas = data.byCategoryExpenses.find((item) => item.category === category)?.total ?? 0;
      const totalReceitas = data.byCategoryIncomes.find((item) => item.category === category)?.total ?? 0;
      return {
        categoria: category,
        totalDespesas,
        totalReceitas,
        saldo: totalReceitas - totalDespesas
      };
    });
  }, [data]);

  const behaviorChart = data
    ? [
        { nome: "Fixos", valor: data.behaviorSplit.fixed },
        { nome: "Variáveis", valor: data.behaviorSplit.variable },
        { nome: "Provisões", valor: data.behaviorSplit.provision }
      ]
    : [];
  const monthlyRows = data ? data.monthlyEvolution.slice().reverse() : [];

  const exportCsv = () => {
    downloadTransactionsCsv({ startDate, endDate })
      .then((blob) => downloadBlob("lancamentos.csv", blob))
      .catch(() => null);
  };

  const exportExcel = () => {
    downloadTransactionsXlsx({ startDate, endDate })
      .then((blob) => downloadBlob("lancamentos.xlsx", blob))
      .catch(() => null);
  };

  if (query.isLoading) {
    return <Skeleton className="h-[420px] w-full" />;
  }

  if (!data) {
    return null;
  }

  return (
    <section className="space-y-4">
      <Card className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div>
          <label className="mb-1 block text-sm">Data inicial</label>
          <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-sm">Data final</label>
          <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </div>
        <div className="self-end">
          <Button variant="secondary" className="w-full" onClick={exportCsv}>
            Exportar CSV
          </Button>
        </div>
        <div className="self-end">
          <Button variant="secondary" className="w-full" onClick={exportExcel}>
            Exportar Excel
          </Button>
        </div>
        <div className="self-end text-sm text-muted md:col-span-2 xl:col-span-1">
          Período: {formatDate(startDate)} até {formatDate(endDate)}
        </div>
      </Card>

      <Card className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto]">
        <div>
          <label className="mb-1 block text-sm">Mês retroativo (atalho)</label>
          <Input
            type="month"
            value={monthReference}
            onChange={(event) => setMonthReference(event.target.value)}
          />
        </div>
        <div className="self-end">
          <Button className="w-full" onClick={() => applyMonthRange(monthReference)}>
            Usar mês
          </Button>
        </div>
        <div className="self-end">
          <Button variant="secondary" className="w-full" onClick={() => applyRelativeMonth(0)}>
            Mês atual
          </Button>
        </div>
        <div className="self-end">
          <Button variant="secondary" className="w-full" onClick={() => applyRelativeMonth(1)}>
            Mês anterior
          </Button>
        </div>
      </Card>

      <div className="content-grid">
        <Card>
          <CardDescription>Receitas previstas</CardDescription>
          <CardTitle className="text-2xl">{formatCurrency(data.rangeTotals.plannedIncome)}</CardTitle>
        </Card>
        <Card>
          <CardDescription>Despesas previstas</CardDescription>
          <CardTitle className="text-2xl">{formatCurrency(data.rangeTotals.plannedExpense)}</CardTitle>
        </Card>
        <Card>
          <CardDescription>Saldo previsto</CardDescription>
          <CardTitle className="text-2xl">{formatCurrency(data.rangeTotals.plannedBalance)}</CardTitle>
        </Card>
        <Card>
          <CardDescription>Receitas realizadas</CardDescription>
          <CardTitle className="text-2xl">{formatCurrency(data.rangeTotals.realIncome)}</CardTitle>
        </Card>
        <Card>
          <CardDescription>Despesas realizadas</CardDescription>
          <CardTitle className="text-2xl">{formatCurrency(data.rangeTotals.realExpense)}</CardTitle>
        </Card>
        <Card>
          <CardDescription>Saldo real</CardDescription>
          <CardTitle className="text-2xl">{formatCurrency(data.rangeTotals.realBalance)}</CardTitle>
        </Card>
        <Card>
          <CardDescription>Desvio (real - previsto)</CardDescription>
          <CardTitle className={`text-2xl ${data.plannedVsReal.variance < 0 ? "text-danger" : "text-success"}`}>
            {formatCurrency(data.plannedVsReal.variance)}
          </CardTitle>
        </Card>
      </div>

      {healthQuery.data ? (
        <div className="grid gap-4 xl:grid-cols-4">
          <Card>
            <CardDescription>Score de saúde financeira</CardDescription>
            <CardTitle className="text-2xl">{healthQuery.data.score.value}</CardTitle>
            <CardDescription>Nível: {healthQuery.data.score.level}</CardDescription>
          </Card>
          <Card>
            <CardDescription>Taxa de poupança</CardDescription>
            <CardTitle className="text-2xl">{healthQuery.data.kpis.savingsRate.toFixed(2)}%</CardTitle>
          </Card>
          <Card>
            <CardDescription>Comprometimento da renda</CardDescription>
            <CardTitle className="text-2xl">{healthQuery.data.kpis.commitmentRate.toFixed(2)}%</CardTitle>
          </Card>
          <Card>
            <CardDescription>Cobertura de caixa</CardDescription>
            <CardTitle className="text-2xl">{healthQuery.data.kpis.cashCoverageMonths.toFixed(2)} meses</CardTitle>
          </Card>
        </div>
      ) : null}

      {healthQuery.data ? (
        <Card className="p-4">
          <CardTitle>Alertas de saúde financeira</CardTitle>
          <div className="mt-2 space-y-1">
            {healthQuery.data.alerts.map((alert) => (
              <p key={alert} className="text-sm text-muted">
                - {alert}
              </p>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="h-[320px] p-4">
          <CardTitle className="mb-3">Fixos x Variáveis x Provisões</CardTitle>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={behaviorChart}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="nome" />
              <YAxis tickFormatter={(value) => formatCurrency(value)} />
              <Tooltip formatter={(value: number) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey="valor" name="Total" fill="#0891b2" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <CardTitle>Próximos vencimentos</CardTitle>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold">Próximos 7 dias</p>
              <div className="space-y-2">
                {data.upcoming7.length === 0 ? (
                  <p className="text-sm text-muted">Sem lançamentos.</p>
                ) : (
                  data.upcoming7.map((row) => (
                    <div key={row.id} className="rounded-lg border border-border p-2">
                      <p className="text-sm font-medium">{row.description}</p>
                      <p className="text-xs text-muted">{formatDate(row.dueDate.slice(0, 10))}</p>
                      <p className="text-sm">{formatCurrency(row.amountPlanned)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">Próximos 30 dias</p>
              <div className="space-y-2">
                {data.upcoming30.length === 0 ? (
                  <p className="text-sm text-muted">Sem lançamentos.</p>
                ) : (
                  data.upcoming30.slice(0, 8).map((row) => (
                    <div key={row.id} className="rounded-lg border border-border p-2">
                      <p className="text-sm font-medium">{row.description}</p>
                      <p className="text-xs text-muted">{formatDate(row.dueDate.slice(0, 10))}</p>
                      <p className="text-sm">{formatCurrency(row.amountPlanned)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {healthQuery.data ? (
        <Card className="h-[320px] p-4">
          <CardTitle className="mb-3">Tendência de saúde (12 meses)</CardTitle>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={healthQuery.data.trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="score" stroke="#0891b2" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="savingsRate" stroke="#0f9f6e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="commitmentRate" stroke="#ef4444" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      ) : null}

      <Card className="h-[340px] p-4">
        <CardTitle className="mb-1">Histórico mensal (12 meses)</CardTitle>
        <CardDescription className="mb-3">
          Compare saldo previsto e saldo realizado para visualizar meses retroativos.
        </CardDescription>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.monthlyEvolution}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value) => formatCurrency(value)} />
            <Tooltip formatter={(value: number) => formatCurrency(value)} />
            <Legend />
            <Bar dataKey="balance" name="Saldo previsto" fill="#0891b2" />
            <Bar dataKey="realBalance" name="Saldo realizado" fill="#0f9f6e" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <CardTitle className="text-base">Resumo mensal retroativo (12 meses)</CardTitle>
          <CardDescription>Use um mês da tabela para atualizar o filtro acima.</CardDescription>
        </div>
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b border-border bg-surface-soft text-left">
            <tr>
              <th className="px-3 py-2">Mês</th>
              <th className="px-3 py-2">Receitas prev.</th>
              <th className="px-3 py-2">Receitas real.</th>
              <th className="px-3 py-2">Despesas prev.</th>
              <th className="px-3 py-2">Despesas real.</th>
              <th className="px-3 py-2">Saldo prev.</th>
              <th className="px-3 py-2">Saldo real.</th>
              <th className="px-3 py-2">Desvio</th>
              <th className="px-3 py-2">Ação</th>
            </tr>
          </thead>
          <tbody>
            {monthlyRows.map((row) => {
              const variance = Number((row.realBalance - row.balance).toFixed(2));
              return (
                <tr key={row.key} className="border-b border-border/70">
                  <td className="px-3 py-2 font-medium">{row.month}</td>
                  <td className="px-3 py-2 text-success">{formatCurrency(row.income)}</td>
                  <td className="px-3 py-2 text-success">{formatCurrency(row.realIncome)}</td>
                  <td className="px-3 py-2 text-danger">{formatCurrency(row.expense)}</td>
                  <td className="px-3 py-2 text-danger">{formatCurrency(row.realExpense)}</td>
                  <td className={`px-3 py-2 ${row.balance < 0 ? "text-danger" : "text-success"}`}>
                    {formatCurrency(row.balance)}
                  </td>
                  <td className={`px-3 py-2 ${row.realBalance < 0 ? "text-danger" : "text-success"}`}>
                    {formatCurrency(row.realBalance)}
                  </td>
                  <td className={`px-3 py-2 ${variance < 0 ? "text-danger" : "text-success"}`}>
                    {formatCurrency(variance)}
                  </td>
                  <td className="px-3 py-2">
                    <Button size="sm" variant="secondary" onClick={() => applyMonthRange(row.key)}>
                      Usar mês
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="border-b border-border px-4 py-3">
          <CardTitle className="text-base">Categoria: despesas x receitas</CardTitle>
        </div>
        <table className="w-full min-w-[680px] text-sm md:min-w-[760px]">
          <thead className="border-b border-border bg-surface-soft text-left">
            <tr>
              <th className="px-3 py-2">Categoria</th>
              <th className="px-3 py-2">Despesas</th>
              <th className="px-3 py-2">Receitas</th>
              <th className="px-3 py-2">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {categoryRows.map((row) => (
              <tr key={row.categoria} className="border-b border-border/70">
                <td className="px-3 py-2">{row.categoria}</td>
                <td className="px-3 py-2 text-danger">{formatCurrency(row.totalDespesas)}</td>
                <td className="px-3 py-2 text-success">{formatCurrency(row.totalReceitas)}</td>
                <td className={`px-3 py-2 ${row.saldo < 0 ? "text-danger" : "text-success"}`}>
                  {formatCurrency(row.saldo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}
