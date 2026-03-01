"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createCategorySchema } from "@financeiro/contracts";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/ui/button";
import { Card, CardDescription, CardTitle } from "../../components/ui/card";
import { Dialog } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import {
  createCategoryBudget,
  createCategory,
  deleteCategoryBudget,
  deleteCategory,
  getCategoryBudgets,
  getCategories,
  updateCategoryBudget,
  updateCategory
} from "../../lib/api/endpoints";
import { formatCurrency } from "../../lib/utils/format";

const schema = createCategorySchema;
type FormValues = z.infer<typeof schema>;

export default function CategoriasPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [monthReference, setMonthReference] = useState(format(new Date(), "yyyy-MM"));
  const [budgetDraftByCategory, setBudgetDraftByCategory] = useState<Record<string, string>>({});
  const categoriesQuery = useQuery({ queryKey: ["categories"], queryFn: getCategories });
  const budgetsQuery = useQuery({
    queryKey: ["category-budgets", monthReference],
    queryFn: () => getCategoryBudgets({ monthReference })
  });
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      type: "BOTH",
      color: "#0891b2",
      icon: "Tag"
    }
  });

  const mutation = useMutation({
    mutationFn: (values: FormValues) => createCategory(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      form.reset();
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
    }
  });
  const editingCategory = (categoriesQuery.data ?? []).find((item) => item.id === editingId) ?? null;
  const editForm = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: editingCategory
      ? {
          name: editingCategory.name,
          type: editingCategory.type as "INCOME" | "EXPENSE" | "BOTH",
          color: editingCategory.color,
          icon: editingCategory.icon
        }
      : {
          name: "",
          type: "BOTH",
          color: "#0891b2",
          icon: "Tag"
        }
  });
  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; values: FormValues }) => updateCategory(payload.id, payload.values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      setEditingId(null);
    }
  });
  const createBudgetMutation = useMutation({
    mutationFn: (payload: { categoryId: string; limitAmount: number }) =>
      createCategoryBudget({
        categoryId: payload.categoryId,
        monthReference,
        limitAmount: payload.limitAmount
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["category-budgets", monthReference] });
      await queryClient.invalidateQueries({ queryKey: ["budget-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["budget-alerts"] });
    }
  });
  const updateBudgetMutation = useMutation({
    mutationFn: (payload: { id: string; limitAmount: number }) =>
      updateCategoryBudget(payload.id, { limitAmount: payload.limitAmount }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["category-budgets", monthReference] });
      await queryClient.invalidateQueries({ queryKey: ["budget-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["budget-alerts"] });
    }
  });
  const deleteBudgetMutation = useMutation({
    mutationFn: (id: string) => deleteCategoryBudget(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["category-budgets", monthReference] });
      await queryClient.invalidateQueries({ queryKey: ["budget-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["budget-alerts"] });
    }
  });

  const budgetsByCategoryId = useMemo(
    () => new Map((budgetsQuery.data ?? []).map((budget) => [budget.categoryId, budget])),
    [budgetsQuery.data]
  );

  useEffect(() => {
    const nextDraft: Record<string, string> = {};
    for (const [categoryId, budget] of budgetsByCategoryId.entries()) {
      nextDraft[categoryId] = String(budget.limitAmount);
    }
    setBudgetDraftByCategory(nextDraft);
  }, [budgetsByCategoryId]);

  if (categoriesQuery.isLoading || budgetsQuery.isLoading) {
    return (
      <section className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <Skeleton className="h-[360px] w-full" />
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[140px] w-full" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <Card>
        <CardTitle>Nova categoria</CardTitle>
        <form className="mt-3 space-y-2" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <Input placeholder="Nome da categoria" {...form.register("name")} />
          <Select {...form.register("type")}>
            <option value="INCOME">Entrada</option>
            <option value="EXPENSE">Saida</option>
            <option value="BOTH">Ambos</option>
          </Select>
          <Input type="color" {...form.register("color")} />
          <Input placeholder="Icone (ex.: Home)" {...form.register("icon")} />
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar categoria"}
          </Button>
        </form>
      </Card>

      <div className="space-y-3">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Limites mensais por categoria</CardTitle>
              <CardDescription>Defina limite de gasto para o mes selecionado.</CardDescription>
            </div>
            <Input
              type="month"
              className="max-w-[220px]"
              value={monthReference}
              onChange={(event) => setMonthReference(event.target.value)}
            />
          </div>
        </Card>

        <div className="grid gap-3 md:grid-cols-2">
        {(categoriesQuery.data ?? []).map((category) => (
          <Card key={category.id}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: category.color }} />
                <CardTitle>{category.name}</CardTitle>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="secondary" onClick={() => setEditingId(category.id)}>
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => deleteMutation.mutate(category.id)}
                  disabled={deleteMutation.isPending}
                >
                  Excluir
                </Button>
              </div>
            </div>
            <CardDescription>
              {category.type} | {category.icon}
            </CardDescription>

            {category.type !== "INCOME" ? (
              <div className="mt-3 space-y-2 rounded-lg border border-border/80 bg-surface-soft/60 p-3">
                <p className="text-xs uppercase tracking-wide text-muted">Orcamento mensal</p>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Sem limite"
                  value={budgetDraftByCategory[category.id] ?? ""}
                  onChange={(event) =>
                    setBudgetDraftByCategory((draft) => ({
                      ...draft,
                      [category.id]: event.target.value
                    }))
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const draftValue = Number(budgetDraftByCategory[category.id] ?? 0);
                      if (!Number.isFinite(draftValue) || draftValue <= 0) return;

                      const existingBudget = budgetsByCategoryId.get(category.id);
                      if (existingBudget) {
                        updateBudgetMutation.mutate({
                          id: existingBudget.id,
                          limitAmount: draftValue
                        });
                        return;
                      }

                      createBudgetMutation.mutate({
                        categoryId: category.id,
                        limitAmount: draftValue
                      });
                    }}
                    disabled={createBudgetMutation.isPending || updateBudgetMutation.isPending}
                  >
                    Salvar limite
                  </Button>
                  {budgetsByCategoryId.get(category.id) ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        const existingBudget = budgetsByCategoryId.get(category.id);
                        if (!existingBudget) return;
                        deleteBudgetMutation.mutate(existingBudget.id);
                        setBudgetDraftByCategory((draft) => ({
                          ...draft,
                          [category.id]: ""
                        }));
                      }}
                      disabled={deleteBudgetMutation.isPending}
                    >
                      Remover
                    </Button>
                  ) : null}
                </div>

                {budgetsByCategoryId.get(category.id) ? (
                  <div className="text-xs text-muted">
                    <p>Gasto: {formatCurrency(budgetsByCategoryId.get(category.id)?.spent ?? 0)}</p>
                    <p>Projetado: {formatCurrency(budgetsByCategoryId.get(category.id)?.projected ?? 0)}</p>
                    <p>Nivel: {budgetsByCategoryId.get(category.id)?.alertLevel ?? "NONE"}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted">Sem limite cadastrado para o mes.</p>
                )}
              </div>
            ) : null}
          </Card>
        ))}
      </div>
      </div>

      <Dialog
        open={!!editingCategory}
        title="Editar categoria"
        onClose={() => setEditingId(null)}
        footer={
          <Button
            onClick={editForm.handleSubmit((values) => {
              if (!editingCategory) return;
              updateMutation.mutate({ id: editingCategory.id, values });
            })}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Salvando..." : "Salvar alteracoes"}
          </Button>
        }
      >
        {editingCategory ? (
          <div className="space-y-2">
            <Input {...editForm.register("name")} />
            <Select {...editForm.register("type")}>
              <option value="INCOME">Entrada</option>
              <option value="EXPENSE">Saida</option>
              <option value="BOTH">Ambos</option>
            </Select>
            <Input type="color" {...editForm.register("color")} />
            <Input {...editForm.register("icon")} />
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
