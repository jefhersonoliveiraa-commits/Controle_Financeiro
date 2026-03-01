"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { Card, CardDescription, CardTitle } from "../ui/card";
import { formatCurrency, formatDate } from "../../lib/utils/format";

type CashflowRow = {
  date: string;
  incomes: number;
  expenses: number;
  cumulativeBalance: number;
};

const chartColors = {
  grid: "hsl(var(--border) / 0.6)",
  income: "hsl(var(--success))",
  expense: "hsl(var(--danger))",
  balance: "hsl(var(--brand))"
};

export function CashflowChart({ data }: { data: CashflowRow[] }) {
  return (
    <Card className="h-[340px] p-4 md:p-5">
      <CardTitle className="mb-1 text-base">Curva de fluxo diario</CardTitle>
      <CardDescription className="mb-3">Acompanhamento de entradas, saidas e saldo acumulado.</CardDescription>
      <ResponsiveContainer width="100%" height="82%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="4 4" stroke={chartColors.grid} />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(value) => formatDate(value).slice(0, 5)} />
          <YAxis tickFormatter={(value) => formatCurrency(value)} tick={{ fontSize: 12 }} />
          <Tooltip
            labelFormatter={(value) => formatDate(String(value))}
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--surface-elevated))"
            }}
          />
          <Legend iconType="circle" />
          <Line type="monotone" dataKey="incomes" name="Entradas" stroke={chartColors.income} strokeWidth={2.2} dot={false} />
          <Line type="monotone" dataKey="expenses" name="Saidas" stroke={chartColors.expense} strokeWidth={2.2} dot={false} />
          <Line type="monotone" dataKey="cumulativeBalance" name="Saldo acumulado" stroke={chartColors.balance} strokeWidth={2.2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
