"use client";

import { useQuery } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowDownRight,
  ArrowUpRight,
  CircleAlert,
  PiggyBank,
  Wallet2
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Button } from "../components/ui/button";
import { Card, CardDescription, CardTitle } from "../components/ui/card";
import { Skeleton } from "../components/ui/skeleton";
import {
  getBudgetAlerts,
  getBudgetsOverview,
  getCashflow,
  getGoals,
  getReportsSummary
} from "../lib/api/endpoints";
import { formatCurrency } from "../lib/utils/format";

const chartColors = {
  grid: "hsl(var(--border) / 0.6)",
  income: "hsl(var(--success))",
  expense: "hsl(var(--danger))",
  balance: "hsl(var(--brand))"
};

export default function DashboardPage() {
  const router = useRouter();
  const startDate = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const endDate = format(endOfMonth(new Date()), "yyyy-MM-dd");

  const cashflowQuery = useQuery({
    queryKey: ["cashflow-dashboard", startDate, endDate],
    queryFn: () => getCashflow({ startDate, endDate })
  });

  const goalsQuery = useQuery({
    queryKey: ["goals-dashboard"],
    queryFn: getGoals
  });

  const reportQuery = useQuery({
    queryKey: ["reports-dashboard", startDate, endDate],
    queryFn: () => getReportsSummary({ startDate, endDate })
  });
  const budgetsOverviewQuery = useQuery({
    queryKey: ["budget-overview"],
    queryFn: () => getBudgetsOverview()
  });
  const budgetAlertsQuery = useQuery({
    queryKey: ["budget-alerts"],
    queryFn: () => getBudgetAlerts()
  });

  if (
    cashflowQuery.isLoading ||
    reportQuery.isLoading ||
    goalsQuery.isLoading ||
    budgetsOverviewQuery.isLoading ||
    budgetAlertsQuery.isLoading
  ) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-40 w-full" />
        <div className="content-grid">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
        <Skeleton className="h-[360px] w-full" />
      </section>
    );
  }

  const currentMonth = format(new Date(), "MMMM 'de' yyyy", { locale: ptBR });
  const cashRows = cashflowQuery.data?.rows ?? [];
  const report = reportQuery.data;
  const finalBalance = cashRows[cashRows.length - 1]?.cumulativeBalance ?? 0;
  const goalAvg = goalsQuery.data?.reduce((sum, goal) => sum + goal.requiredMonthlyAverage, 0) ?? 0;
  const negativeDays = cashRows.filter((row) => row.alert === "NEGATIVE").length;
  const budgetOverview = budgetsOverviewQuery.data;
  const budgetAlerts = budgetAlertsQuery.data ?? [];
  const budgetCriticalAlerts = budgetAlerts.filter((item) => item.level === "CRITICAL" || item.level === "EXCEEDED").length;

  const topExpenseCategory = (report?.byCategoryExpenses ?? [])
    .slice()
    .sort((a, b) => b.total - a.total)[0];
  const topIncomeCategory = (report?.byCategoryIncomes ?? [])
    .slice()
    .sort((a, b) => b.total - a.total)[0];

  const monthComparisonChart = report
    ? [
        {
          periodo: report.monthComparison.previous.month || "Mes anterior",
          entradas: report.monthComparison.previous.income,
          saidas: report.monthComparison.previous.expense,
          saldo: report.monthComparison.previous.balance
        },
        {
          periodo: report.monthComparison.current.month || "Mes atual",
          entradas: report.monthComparison.current.income,
          saidas: report.monthComparison.current.expense,
          saldo: report.monthComparison.current.balance
        }
      ]
    : [];

  const diffBalance = report?.plannedVsReal.variance ?? 0;
  const realIncome = report?.rangeTotals.realIncome ?? 0;
  const realExpense = report?.rangeTotals.realExpense ?? 0;
  const realBalance = report?.rangeTotals.realBalance ?? 0;

  return (
    <section className="space-y-4">
      <Card className="relative overflow-hidden border-brand/25 bg-gradient-to-br from-brand/20 via-surface to-surface">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-brand/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted">Visao executiva</p>
            <h2 className="mt-1 font-[var(--font-title)] text-3xl font-semibold capitalize">{currentMonth}</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              Saldo projetado do periodo em {formatCurrency(finalBalance)} com {negativeDays} dias em alerta.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => router.push("/lancamentos?novo=1")}>
              Novo lancamento
            </Button>
            <Button onClick={() => router.push("/fluxo-caixa")}>Ver fluxo detalhado</Button>
          </div>
        </div>
      </Card>

      <div className="content-grid">
        <Card className="border-success/25 bg-success/10">
          <div className="mb-2 flex items-center justify-between">
            <CardDescription>Entradas previstas</CardDescription>
            <ArrowUpRight size={16} className="text-success" />
          </div>
          <CardTitle className="text-2xl">{formatCurrency(report?.rangeTotals.plannedIncome ?? 0)}</CardTitle>
        </Card>

        <Card className="border-danger/25 bg-danger/10">
          <div className="mb-2 flex items-center justify-between">
            <CardDescription>Saidas previstas</CardDescription>
            <ArrowDownRight size={16} className="text-danger" />
          </div>
          <CardTitle className="text-2xl">{formatCurrency(report?.rangeTotals.plannedExpense ?? 0)}</CardTitle>
        </Card>

        <Card className="border-brand/25 bg-brand/10">
          <div className="mb-2 flex items-center justify-between">
            <CardDescription>Saldo acumulado previsto</CardDescription>
            <Wallet2 size={16} className="text-brand" />
          </div>
          <CardTitle className="text-2xl">{formatCurrency(finalBalance)}</CardTitle>
        </Card>

        <Card className="border-warning/25 bg-warning/10">
          <div className="mb-2 flex items-center justify-between">
            <CardDescription>Media mensal de metas</CardDescription>
            <PiggyBank size={16} className="text-warning" />
          </div>
          <CardTitle className="text-2xl">{formatCurrency(goalAvg)}</CardTitle>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-success/25 bg-success/10">
          <div className="mb-2 flex items-center justify-between">
            <CardDescription>Entradas realizadas</CardDescription>
            <ArrowUpRight size={16} className="text-success" />
          </div>
          <CardTitle className="text-2xl">{formatCurrency(realIncome)}</CardTitle>
          <p className="mt-1 text-xs text-muted">Somente lancamentos liquidados no mes.</p>
        </Card>

        <Card className="border-danger/25 bg-danger/10">
          <div className="mb-2 flex items-center justify-between">
            <CardDescription>Saidas realizadas</CardDescription>
            <ArrowDownRight size={16} className="text-danger" />
          </div>
          <CardTitle className="text-2xl">{formatCurrency(realExpense)}</CardTitle>
          <p className="mt-1 text-xs text-muted">Despesas efetivamente pagas/baixas no mes.</p>
        </Card>

        <Card className="border-brand/25 bg-brand/10">
          <div className="mb-2 flex items-center justify-between">
            <CardDescription>Saldo realizado</CardDescription>
            <Wallet2 size={16} className="text-brand" />
          </div>
          <CardTitle className="text-2xl">{formatCurrency(realBalance)}</CardTitle>
          <p className="mt-1 text-xs text-muted">Entradas realizadas menos saidas realizadas.</p>
        </Card>

        <Card className={diffBalance < 0 ? "border-danger/25 bg-danger/10" : "border-success/25 bg-success/10"}>
          <div className="mb-2 flex items-center justify-between">
            <CardDescription>Desvio vs previsto</CardDescription>
            <CircleAlert size={16} className={diffBalance < 0 ? "text-danger" : "text-success"} />
          </div>
          <CardTitle className="text-2xl">{formatCurrency(diffBalance)}</CardTitle>
          <p className="mt-1 text-xs text-muted">Saldo real menos saldo previsto no periodo.</p>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border-brand/25 bg-brand/10">
          <CardDescription>Orcamentos do mes</CardDescription>
          <CardTitle className="mt-1 text-2xl">
            {budgetOverview?.totals.budgetCount ?? 0}
          </CardTitle>
          <p className="mt-1 text-xs text-muted">
            Projetado: {formatCurrency(budgetOverview?.totals.totalProjected ?? 0)} /{" "}
            {formatCurrency(budgetOverview?.totals.totalLimit ?? 0)}
          </p>
        </Card>
        <Card className={budgetCriticalAlerts > 0 ? "border-danger/25 bg-danger/10" : "border-success/25 bg-success/10"}>
          <CardDescription>Alertas de limite</CardDescription>
          <CardTitle className="mt-1 text-2xl">{budgetAlerts.length}</CardTitle>
          <p className="mt-1 text-xs text-muted">
            Criticos/excedidos: {budgetCriticalAlerts}
          </p>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Card className="h-[380px] p-4">
          <CardTitle className="mb-1 text-base">Evolucao dos ultimos 12 meses</CardTitle>
          <CardDescription className="mb-3">
            Tendencia de receitas, despesas e saldo real no periodo.
          </CardDescription>
          <ResponsiveContainer width="100%" height="85%">
            <LineChart data={report?.monthlyEvolution ?? []}>
              <CartesianGrid strokeDasharray="4 4" stroke={chartColors.grid} />
              <XAxis dataKey="month" />
              <YAxis tickFormatter={(value) => formatCurrency(value)} />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid hsl(var(--border))",
                  background: "hsl(var(--surface-elevated))"
                }}
              />
              <Legend />
              <Line type="monotone" dataKey="income" name="Receitas previstas" stroke={chartColors.income} strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="expense" name="Despesas previstas" stroke={chartColors.expense} strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="realBalance" name="Saldo real" stroke={chartColors.balance} strokeWidth={2.5} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <CardTitle className="text-base">Insight rapido</CardTitle>
          <div className="mt-3 space-y-3 text-sm">
            <div className="rounded-xl border border-border bg-surface-soft p-3">
              <p className="text-xs uppercase tracking-wide text-muted">Previsto x real</p>
              <p className="mt-1 font-semibold">
                Diferenca de {formatCurrency(diffBalance)}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface-soft p-3">
              <p className="text-xs uppercase tracking-wide text-muted">Maior categoria de despesa</p>
              <p className="mt-1 font-semibold">
                {topExpenseCategory?.category ?? "Sem dados"} ({formatCurrency(topExpenseCategory?.total ?? 0)})
              </p>
            </div>
            <div className="rounded-xl border border-border bg-surface-soft p-3">
              <p className="text-xs uppercase tracking-wide text-muted">Maior categoria de entrada</p>
              <p className="mt-1 font-semibold">
                {topIncomeCategory?.category ?? "Sem dados"} ({formatCurrency(topIncomeCategory?.total ?? 0)})
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-soft p-3">
              <CircleAlert size={16} className={negativeDays > 0 ? "text-warning" : "text-success"} />
              <p>
                {negativeDays > 0
                  ? `${negativeDays} dias ficaram com saldo negativo no periodo.`
                  : "Nenhum dia com saldo negativo no periodo."}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="h-[360px] p-4">
          <CardTitle className="mb-1 text-base">Despesas por categoria</CardTitle>
          <CardDescription className="mb-3">Distribuicao do mes atual</CardDescription>
          {report?.byCategoryExpenses.length ? (
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Pie data={report.byCategoryExpenses} dataKey="total" nameKey="category" outerRadius={105}>
                  {report.byCategoryExpenses.map((item) => (
                    <Cell key={item.category} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted">Sem despesas por categoria neste periodo.</p>
          )}
        </Card>

        <Card className="h-[360px] p-4">
          <CardTitle className="mb-1 text-base">Entradas por categoria</CardTitle>
          <CardDescription className="mb-3">Distribuicao do mes atual</CardDescription>
          {report?.byCategoryIncomes.length ? (
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Pie data={report.byCategoryIncomes} dataKey="total" nameKey="category" outerRadius={105}>
                  {report.byCategoryIncomes.map((item) => (
                    <Cell key={item.category} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatCurrency(value)} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted">Sem entradas por categoria neste periodo.</p>
          )}
        </Card>
      </div>

      <Card className="h-[360px] p-4">
        <CardTitle className="mb-1 text-base">Mes atual x mes anterior</CardTitle>
        <CardDescription className="mb-3">
          Comparativo entre entradas, saidas e saldo.
        </CardDescription>
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={monthComparisonChart}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
            <XAxis dataKey="periodo" />
            <YAxis tickFormatter={(value) => formatCurrency(value)} />
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{
                borderRadius: 12,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--surface-elevated))"
              }}
            />
            <Legend iconType="circle" />
            <Bar dataKey="entradas" name="Entradas" fill={chartColors.income} radius={[8, 8, 0, 0]} />
            <Bar dataKey="saidas" name="Saidas" fill={chartColors.expense} radius={[8, 8, 0, 0]} />
            <Bar dataKey="saldo" name="Saldo" fill={chartColors.balance} radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <Card className="border-brand/20 bg-brand/10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Proximo passo recomendado</CardTitle>
            <CardDescription className="mt-1">
              Revise os lancamentos pendentes dos proximos 7 dias para manter previsibilidade.
            </CardDescription>
          </div>
          <Button variant="secondary" onClick={() => router.push("/lancamentos")}>
            Abrir lancamentos
          </Button>
        </div>
      </Card>
    </section>
  );
}
