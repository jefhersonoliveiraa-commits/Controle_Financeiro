"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createAccountSchema } from "@financeiro/contracts";
import { CreditCard, Landmark, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/ui/button";
import { Card, CardDescription, CardTitle } from "../../components/ui/card";
import { Dialog } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { createAccount, deleteAccount, getAccounts, updateAccount } from "../../lib/api/endpoints";
import { formatCurrency } from "../../lib/utils/format";
import { formatAccountType } from "../../lib/utils/i18n";

const schema = createAccountSchema.extend({
  initialBalanceDate: z.string().min(1)
});

type FormValues = z.infer<typeof schema>;

function accountIcon(type: string) {
  if (type === "BANK_ACCOUNT") return Landmark;
  if (type === "CREDIT_CARD") return CreditCard;
  return Wallet;
}

export default function ContasPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      type: "BANK_ACCOUNT",
      initialBalance: 0,
      initialBalanceDate: new Date().toISOString().slice(0, 10),
      limit: undefined,
      statementClosingDay: undefined,
      statementDueDay: undefined
    }
  });

  const selectedType = form.watch("type");
  const isCreditCard = selectedType === "CREDIT_CARD";

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      createAccount({
        ...values,
        initialBalance: Number(values.initialBalance),
        limit: isCreditCard && values.limit ? Number(values.limit) : undefined,
        statementClosingDay: isCreditCard ? values.statementClosingDay : undefined,
        statementDueDay: isCreditCard ? values.statementDueDay : undefined
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      form.reset({
        ...form.getValues(),
        name: "",
        initialBalance: 0,
        limit: undefined,
        statementClosingDay: undefined,
        statementDueDay: undefined
      });
    }
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAccount(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
    }
  });

  const editingAccount = (accountsQuery.data ?? []).find((item) => item.id === editingId) ?? null;
  const editForm = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: editingAccount
      ? {
          name: editingAccount.name,
          type: editingAccount.type as "BANK_ACCOUNT" | "CASH" | "CREDIT_CARD",
          initialBalance: editingAccount.initialBalance,
          initialBalanceDate: editingAccount.initialBalanceDate.slice(0, 10),
          limit: editingAccount.creditLimit ?? undefined,
          statementClosingDay: editingAccount.statementClosingDay ?? undefined,
          statementDueDay: editingAccount.statementDueDay ?? undefined
        }
      : {
          name: "",
          type: "BANK_ACCOUNT",
          initialBalance: 0,
          initialBalanceDate: new Date().toISOString().slice(0, 10),
          limit: undefined,
          statementClosingDay: undefined,
          statementDueDay: undefined
        }
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; values: FormValues }) => updateAccount(payload.id, payload.values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setEditingId(null);
    }
  });

  const totals = useMemo(() => {
    const rows = accountsQuery.data ?? [];
    const initialBalance = rows.reduce((sum, row) => sum + row.initialBalance, 0);
    const creditLimit = rows.reduce((sum, row) => sum + (row.creditLimit ?? 0), 0);
    return { initialBalance, creditLimit };
  }, [accountsQuery.data]);

  if (accountsQuery.isLoading) {
    return (
      <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
        <Skeleton className="h-[560px] w-full" />
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-[120px] w-full" />
            <Skeleton className="h-[120px] w-full" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[150px] w-full" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[380px_1fr]">
      <Card>
        <CardTitle>Nova conta/carteira</CardTitle>
        <CardDescription className="mt-1">
          Limite e dados de fatura aparecem apenas para cartoes de credito.
        </CardDescription>
        <form className="mt-3 space-y-3" onSubmit={form.handleSubmit((values) => mutation.mutate(values))}>
          <div>
            <label className="mb-1 block text-sm">Nome da conta</label>
            <Input placeholder="Ex.: Inter, Nubank, Dinheiro..." {...form.register("name")} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Tipo</label>
            <Select {...form.register("type")}>
              <option value="BANK_ACCOUNT">Conta bancaria</option>
              <option value="CASH">Dinheiro</option>
              <option value="CREDIT_CARD">Cartao de credito</option>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-sm">Saldo inicial</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                {...form.register("initialBalance", { valueAsNumber: true })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm">Data do saldo inicial</label>
              <Input type="date" {...form.register("initialBalanceDate")} />
            </div>
          </div>

          {isCreditCard ? (
            <div className="space-y-2 rounded-xl border border-border bg-surface-soft p-3">
              <p className="text-sm font-semibold">Configuracao da fatura</p>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Limite do cartao"
                {...form.register("limit", { valueAsNumber: true })}
              />
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Dia do fechamento"
                  {...form.register("statementClosingDay", { valueAsNumber: true })}
                />
                <Input
                  type="number"
                  min="1"
                  max="31"
                  placeholder="Dia do vencimento"
                  {...form.register("statementDueDay", { valueAsNumber: true })}
                />
              </div>
            </div>
          ) : null}

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando..." : "Salvar conta"}
          </Button>
        </form>
      </Card>

      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <CardDescription>Total de saldo inicial</CardDescription>
            <CardTitle className="mt-2 text-2xl">{formatCurrency(totals.initialBalance)}</CardTitle>
          </Card>
          <Card>
            <CardDescription>Total de limite disponivel</CardDescription>
            <CardTitle className="mt-2 text-2xl">{formatCurrency(totals.creditLimit)}</CardTitle>
          </Card>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {(accountsQuery.data ?? []).map((account) => {
            const Icon = accountIcon(account.type);
            return (
              <Card key={account.id}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon size={16} className="text-brand" />
                    <CardTitle>{account.name}</CardTitle>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => setEditingId(account.id)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => deleteMutation.mutate(account.id)}
                      disabled={deleteMutation.isPending}
                    >
                      Excluir
                    </Button>
                  </div>
                </div>
                <CardDescription className="mt-1">{formatAccountType(account.type)}</CardDescription>
                <p className="mt-2 text-sm">Saldo inicial: {formatCurrency(account.initialBalance)}</p>
                {account.type === "CREDIT_CARD" ? (
                  <p className="text-sm">Limite: {formatCurrency(account.creditLimit ?? 0)}</p>
                ) : null}
              </Card>
            );
          })}
        </div>
      </div>

      <Dialog
        open={!!editingAccount}
        title="Editar conta"
        onClose={() => setEditingId(null)}
        footer={
          <Button
            onClick={editForm.handleSubmit((values) => {
              if (!editingAccount) return;
              updateMutation.mutate({ id: editingAccount.id, values });
            })}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Salvando..." : "Salvar alteracoes"}
          </Button>
        }
      >
        {editingAccount ? (
          <div className="space-y-2">
            <Input {...editForm.register("name")} />
            <Select {...editForm.register("type")}>
              <option value="BANK_ACCOUNT">Conta bancaria</option>
              <option value="CASH">Dinheiro</option>
              <option value="CREDIT_CARD">Cartao de credito</option>
            </Select>
            <Input type="number" step="0.01" min="0" {...editForm.register("initialBalance", { valueAsNumber: true })} />
            <Input type="date" {...editForm.register("initialBalanceDate")} />
            {editForm.watch("type") === "CREDIT_CARD" ? (
              <>
                <Input type="number" min="0" step="0.01" {...editForm.register("limit", { valueAsNumber: true })} />
                <Input type="number" min="1" max="31" {...editForm.register("statementClosingDay", { valueAsNumber: true })} />
                <Input type="number" min="1" max="31" {...editForm.register("statementDueDay", { valueAsNumber: true })} />
              </>
            ) : null}
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
