"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createRecurrenceSchema } from "@financeiro/contracts";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Card, CardDescription, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Skeleton } from "../../components/ui/skeleton";
import {
  createRecurrence,
  deleteRecurrence,
  getAccounts,
  getCategories,
  getRecurrences,
  updateRecurrence
} from "../../lib/api/endpoints";
import { formatCurrency } from "../../lib/utils/format";
import { formatBehavior, formatFrequency, formatType } from "../../lib/utils/i18n";

const schema = createRecurrenceSchema.extend({
  startsAt: z.string().min(1),
  endsAt: z.string().optional()
});

type FormValues = z.infer<typeof schema>;

export default function RecorrenciasPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const recurrencesQuery = useQuery({ queryKey: ["recurrences"], queryFn: getRecurrences });
  const accountsQuery = useQuery({ queryKey: ["accounts-rec"], queryFn: getAccounts });
  const categoriesQuery = useQuery({ queryKey: ["categories-rec"], queryFn: getCategories });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: "EXPENSE",
      description: "",
      defaultAmount: 0,
      behavior: "FIXED",
      dayOfMonth: 5,
      accountId: "",
      categoryId: "",
      startsAt: new Date().toISOString().slice(0, 10),
      endsAt: "",
      frequency: "MONTHLY",
      autoGenerateMonthly: true
    }
  });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      createRecurrence({
        ...values,
        defaultAmount: Number(values.defaultAmount),
        dayOfMonth: Number(values.dayOfMonth),
        endsAt: values.endsAt || undefined,
        autoGenerateMonthly: true
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recurrences"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      form.reset({
        ...form.getValues(),
        description: "",
        defaultAmount: 0,
        endsAt: ""
      });
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteRecurrence(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recurrences"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
    }
  });

  const editingRecurrence = (recurrencesQuery.data ?? []).find((item) => item.id === editingId) ?? null;
  const editForm = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: editingRecurrence
      ? {
          type: editingRecurrence.type,
          description: editingRecurrence.description,
          defaultAmount: editingRecurrence.defaultAmount,
          behavior: editingRecurrence.behavior,
          dayOfMonth: editingRecurrence.dayOfMonth,
          accountId: editingRecurrence.account.id,
          categoryId: editingRecurrence.category.id,
          startsAt: editingRecurrence.startsAt.slice(0, 10),
          endsAt: editingRecurrence.endsAt ? editingRecurrence.endsAt.slice(0, 10) : "",
          frequency: editingRecurrence.frequency,
          autoGenerateMonthly: true
        }
      : {
          type: "EXPENSE",
          description: "",
          defaultAmount: 0,
          behavior: "FIXED",
          dayOfMonth: 1,
          accountId: "",
          categoryId: "",
          startsAt: new Date().toISOString().slice(0, 10),
          endsAt: "",
          frequency: "MONTHLY",
          autoGenerateMonthly: true
        }
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; values: FormValues }) =>
      updateRecurrence(payload.id, {
        ...payload.values,
        defaultAmount: Number(payload.values.defaultAmount),
        dayOfMonth: Number(payload.values.dayOfMonth),
        endsAt: payload.values.endsAt || null
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recurrences"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      setEditingId(null);
    }
  });

  const isInitialLoading =
    recurrencesQuery.isLoading || accountsQuery.isLoading || categoriesQuery.isLoading;

  if (isInitialLoading) {
    return (
      <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <Skeleton className="h-[620px] w-full" />
        <Skeleton className="h-[620px] w-full" />
      </section>
    );
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <Card>
        <CardTitle>Nova recorrencia</CardTitle>
        <CardDescription className="mt-1">
          Essas recorrencias entram no fluxo de caixa mesmo antes da efetivacao.
        </CardDescription>
        <form className="mt-3 space-y-2" onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}>
          <Input placeholder="Descricao" {...form.register("description")} />
          <div className="grid grid-cols-2 gap-2">
            <Select {...form.register("type")}>
              <option value="INCOME">Entrada</option>
              <option value="EXPENSE">Saida</option>
            </Select>
            <Select {...form.register("behavior")}>
              <option value="FIXED">Fixo</option>
              <option value="VARIABLE">Variavel</option>
              <option value="PROVISION">Provisao</option>
            </Select>
          </div>
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="Valor padrao"
            {...form.register("defaultAmount", { valueAsNumber: true })}
          />
          <Input
            type="number"
            min="1"
            max="31"
            placeholder="Dia do mes"
            {...form.register("dayOfMonth", { valueAsNumber: true })}
          />
          <Select {...form.register("frequency")}>
            <option value="MONTHLY">Mensal</option>
            <option value="BIWEEKLY">Quinzenal</option>
            <option value="WEEKLY">Semanal</option>
          </Select>
          <Select {...form.register("accountId")}>
            <option value="">Conta</option>
            {(accountsQuery.data ?? []).map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
          <Select {...form.register("categoryId")}>
            <option value="">Categoria</option>
            {(categoriesQuery.data ?? []).map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Input type="date" {...form.register("startsAt")} />
            <Input type="date" {...form.register("endsAt")} />
          </div>
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Salvando..." : "Salvar recorrencia"}
          </Button>
        </form>
      </Card>

      <Card>
        <CardTitle>Recorrencias cadastradas</CardTitle>
        <div className="mt-3 space-y-2">
          {(recurrencesQuery.data ?? []).map((item) => (
            <div key={item.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{item.description}</p>
                <p className={item.type === "INCOME" ? "text-success" : "text-danger"}>
                  {formatCurrency(item.defaultAmount)}
                </p>
              </div>
              <p className="text-sm text-muted">
                {formatType(item.type)} | {formatBehavior(item.behavior)} | {formatFrequency(item.frequency)} | Dia{" "}
                {item.dayOfMonth}
              </p>
              <p className="text-xs text-muted">
                Conta: {item.account.name} | Categoria: {item.category.name}
              </p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditingId(item.id)}>
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => deleteMutation.mutate(item.id)}
                  disabled={deleteMutation.isPending}
                >
                  Excluir
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Dialog
        open={!!editingRecurrence}
        title="Editar recorrencia"
        onClose={() => setEditingId(null)}
        footer={
          <Button
            onClick={editForm.handleSubmit((values) => {
              if (!editingRecurrence) return;
              updateMutation.mutate({ id: editingRecurrence.id, values });
            })}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Salvando..." : "Salvar alteracoes"}
          </Button>
        }
      >
        {editingRecurrence ? (
          <div className="space-y-2">
            <Input {...editForm.register("description")} />
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" min="0" step="0.01" {...editForm.register("defaultAmount", { valueAsNumber: true })} />
              <Input type="number" min="1" max="31" {...editForm.register("dayOfMonth", { valueAsNumber: true })} />
            </div>
            <Select {...editForm.register("frequency")}>
              <option value="MONTHLY">Mensal</option>
              <option value="BIWEEKLY">Quinzenal</option>
              <option value="WEEKLY">Semanal</option>
            </Select>
            <Select {...editForm.register("behavior")}>
              <option value="FIXED">Fixo</option>
              <option value="VARIABLE">Variavel</option>
              <option value="PROVISION">Provisao</option>
            </Select>
            <Select {...editForm.register("accountId")}>
              <option value="">Conta</option>
              {(accountsQuery.data ?? []).map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
            <Select {...editForm.register("categoryId")}>
              <option value="">Categoria</option>
              {(categoriesQuery.data ?? []).map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
