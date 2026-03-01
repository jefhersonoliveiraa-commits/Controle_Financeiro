"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createGoalSchema } from "@financeiro/contracts";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardDescription, CardTitle } from "../../components/ui/card";
import { Dialog } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import {
  createGoal,
  deleteGoal,
  getAccounts,
  getCategories,
  getGoalDetails,
  getGoals,
  recalculateGoal,
  updateGoal
} from "../../lib/api/endpoints";
import { formatCurrency, formatDate } from "../../lib/utils/format";
import { formatBehavior, formatStatus } from "../../lib/utils/i18n";

const schema = createGoalSchema.extend({
  dueDate: z.string().min(1)
});

type FormValues = z.infer<typeof schema>;

export default function MetasPage() {
  const queryClient = useQueryClient();
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const goalsQuery = useQuery({ queryKey: ["goals"], queryFn: getGoals });
  const accountsQuery = useQuery({ queryKey: ["accounts-goals"], queryFn: getAccounts });
  const categoriesQuery = useQuery({ queryKey: ["categories-goals"], queryFn: getCategories });
  const detailsQuery = useQuery({
    queryKey: ["goals-details", selectedGoalId],
    queryFn: () => getGoalDetails(selectedGoalId!),
    enabled: !!selectedGoalId
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "Juntar R$ 20.000",
      targetAmount: 20000,
      accumulatedAmount: 0,
      dueDate: new Date(new Date().setMonth(new Date().getMonth() + 10)).toISOString().slice(0, 10),
      accountId: "",
      categoryId: "",
      saveDayOfMonth: 25
    }
  });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      createGoal({
        ...values,
        targetAmount: Number(values.targetAmount),
        accumulatedAmount: Number(values.accumulatedAmount),
        saveDayOfMonth: Number(values.saveDayOfMonth)
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["goals"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      form.reset({
        ...form.getValues(),
        name: "",
        targetAmount: 0,
        accumulatedAmount: 0
      });
    }
  });

  const updateMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      name: string;
      targetAmount: number;
      dueDate: string;
      accountId: string;
      categoryId: string;
      saveDayOfMonth: number;
    }) =>
      updateGoal(payload.id, {
        name: payload.name,
        targetAmount: payload.targetAmount,
        dueDate: payload.dueDate,
        accountId: payload.accountId,
        categoryId: payload.categoryId,
        saveDayOfMonth: payload.saveDayOfMonth
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["goals"] });
      await queryClient.invalidateQueries({ queryKey: ["goals-details"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      setSelectedGoalId(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteGoal(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["goals"] });
      await queryClient.invalidateQueries({ queryKey: ["goals-details"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      setSelectedGoalId(null);
    }
  });

  const recalcMutation = useMutation({
    mutationFn: (id: string) => recalculateGoal(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["goals"] });
      await queryClient.invalidateQueries({ queryKey: ["goals-details"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      await queryClient.invalidateQueries({ queryKey: ["reports-dashboard"] });
    }
  });

  const selectedGoal = detailsQuery.data;
  const goalEditForm = useForm<{
    name: string;
    targetAmount: number;
    dueDate: string;
    accountId: string;
    categoryId: string;
    saveDayOfMonth: number;
  }>({
    values: selectedGoal
      ? {
          name: selectedGoal.name,
          targetAmount: selectedGoal.targetAmount,
          dueDate: selectedGoal.dueDate.slice(0, 10),
          accountId: selectedGoal.account.id,
          categoryId: selectedGoal.category.id,
          saveDayOfMonth: selectedGoal.saveDayOfMonth
        }
      : {
          name: "",
          targetAmount: 0,
          dueDate: new Date().toISOString().slice(0, 10),
          accountId: "",
          categoryId: "",
          saveDayOfMonth: 1
        }
  });

  const isInitialLoading = goalsQuery.isLoading || accountsQuery.isLoading || categoriesQuery.isLoading;

  if (isInitialLoading) {
    return (
      <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <Skeleton className="h-[540px] w-full" />
        <div className="space-y-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-[170px] w-full" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <Card>
        <CardTitle>Nova meta</CardTitle>
        <CardDescription className="mt-1">
          O sistema calcula quanto guardar por mes e cria saidas automaticas variaveis/provisionadas.
        </CardDescription>
        <form className="mt-3 space-y-2" onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}>
          <Input placeholder="Nome da meta" {...form.register("name")} />
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Valor alvo"
            {...form.register("targetAmount", { valueAsNumber: true })}
          />
          <Input
            type="number"
            min="0"
            step="0.01"
            placeholder="Ja acumulado"
            {...form.register("accumulatedAmount", { valueAsNumber: true })}
          />
          <Input type="date" {...form.register("dueDate")} />
          <Select {...form.register("accountId")}>
            <option value="">Conta de guarda</option>
            {(accountsQuery.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select {...form.register("categoryId")}>
            <option value="">Categoria da meta</option>
            {(categoriesQuery.data ?? []).map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Input
            type="number"
            min="1"
            max="31"
            placeholder="Dia para guardar"
            {...form.register("saveDayOfMonth", { valueAsNumber: true })}
          />
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Criando..." : "Criar meta"}
          </Button>
        </form>
      </Card>

      <div className="space-y-3">
        {(goalsQuery.data ?? []).map((goal) => (
          <Card key={goal.goalId}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <button className="text-left" onClick={() => setSelectedGoalId(goal.goalId)}>
                <CardTitle>{goal.name}</CardTitle>
                <CardDescription>
                  Acumulado {formatCurrency(goal.accumulatedAmount)} de {formatCurrency(goal.targetAmount)}
                </CardDescription>
              </button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => recalcMutation.mutate(goal.goalId)}
                disabled={recalcMutation.isPending}
              >
                {recalcMutation.isPending ? "Recalculando..." : "Recalcular"}
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={() => deleteMutation.mutate(goal.goalId)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Cancelando..." : "Cancelar meta"}
              </Button>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-brand" style={{ width: `${goal.progressPercent}%` }} />
            </div>
            <div className="mt-3 grid gap-2 text-sm md:grid-cols-4">
              <p>Progresso: {goal.progressPercent}%</p>
              <p>Restante: {formatCurrency(goal.remainingAmount)}</p>
              <p>Meses: {goal.monthsRemaining}</p>
              <p>Nova media: {formatCurrency(goal.requiredMonthlyAverage)}</p>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={!!selectedGoalId} title="Detalhamento da meta" onClose={() => setSelectedGoalId(null)}>
        {detailsQuery.isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-2 w-full" />
            <div className="grid gap-2 md:grid-cols-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
            <Skeleton className="h-[180px] w-full" />
          </div>
        ) : !selectedGoal ? (
          <p className="text-sm text-muted">Meta nao encontrada.</p>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="font-semibold">{selectedGoal.name}</p>
              <p className="text-sm text-muted">
                Vencimento: {formatDate(selectedGoal.dueDate.slice(0, 10))} | Dia para guardar:{" "}
                {selectedGoal.saveDayOfMonth}
              </p>
              <p className="text-sm text-muted">
                Conta: {selectedGoal.account.name} | Categoria: {selectedGoal.category.name}
              </p>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-border">
              <div className="h-full rounded-full bg-brand" style={{ width: `${selectedGoal.progressPercent}%` }} />
            </div>

            <div className="grid gap-2 text-sm md:grid-cols-2">
              <p>Acumulado: {formatCurrency(selectedGoal.accumulatedAmount)}</p>
              <p>Meta: {formatCurrency(selectedGoal.targetAmount)}</p>
              <p>Restante: {formatCurrency(selectedGoal.remainingAmount)}</p>
              <p>Nova media mensal: {formatCurrency(selectedGoal.requiredMonthlyAverage)}</p>
              <p>Total planejado: {formatCurrency(selectedGoal.totals.plannedTotal)}</p>
              <p>Total efetivado: {formatCurrency(selectedGoal.totals.settledTotal)}</p>
            </div>

            <div className="grid gap-2 rounded-xl border border-border bg-surface-soft p-3 md:grid-cols-2">
              <Input {...goalEditForm.register("name")} />
              <Input
                type="number"
                min="0"
                step="0.01"
                {...goalEditForm.register("targetAmount", { valueAsNumber: true })}
              />
              <Input type="date" {...goalEditForm.register("dueDate")} />
              <Input
                type="number"
                min="1"
                max="31"
                {...goalEditForm.register("saveDayOfMonth", { valueAsNumber: true })}
              />
              <Select {...goalEditForm.register("accountId")}>
                <option value="">Conta</option>
                {(accountsQuery.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <Select {...goalEditForm.register("categoryId")}>
                <option value="">Categoria</option>
                {(categoriesQuery.data ?? []).map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
              <Button
                variant="secondary"
                onClick={goalEditForm.handleSubmit((values) =>
                  updateMutation.mutate({
                    id: selectedGoal.goalId,
                    name: values.name,
                    targetAmount: Number(values.targetAmount),
                    dueDate: values.dueDate,
                    accountId: values.accountId,
                    categoryId: values.categoryId,
                    saveDayOfMonth: Number(values.saveDayOfMonth)
                  })
                )}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? "Atualizando..." : "Atualizar dados base da meta"}
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteMutation.mutate(selectedGoal.goalId)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? "Inativando..." : "Inativar meta"}
              </Button>
            </div>

            <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
              {selectedGoal.transactions.map((item) => (
                <div key={item.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{item.description}</p>
                    <p className="text-danger">{formatCurrency(item.amountActual ?? item.amountPlanned)}</p>
                  </div>
                  <p className="text-xs text-muted">
                    {formatDate(item.dueDate.slice(0, 10))} | {item.account} | {item.category}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Badge tone={item.status === "PENDING" ? "warning" : item.status === "CANCELED" ? "danger" : "success"}>
                      {formatStatus(item.status)}
                    </Badge>
                    <Badge tone="neutral">{formatBehavior(item.behavior)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Dialog>
    </section>
  );
}
