"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createTransfer, getAccounts } from "../../lib/api/endpoints";
import { Button } from "../ui/button";
import { CardDescription } from "../ui/card";
import { Input } from "../ui/input";
import { Select } from "../ui/select";

const formSchema = z
  .object({
    fromAccountId: z.string().uuid("Selecione a conta de origem."),
    toAccountId: z.string().uuid("Selecione a conta de destino."),
    dueDate: z.string().min(1, "Informe a data."),
    amount: z.coerce.number().positive("Informe um valor maior que zero."),
    description: z.string().min(2, "Informe uma descrição."),
    status: z.enum(["PENDING", "PAID"]).default("PAID"),
    note: z.string().max(500).optional()
  })
  .refine((value) => value.fromAccountId !== value.toAccountId, {
    message: "Origem e destino devem ser contas diferentes.",
    path: ["toAccountId"]
  });

type FormValues = z.infer<typeof formSchema>;

const defaultValues: FormValues = {
  fromAccountId: "",
  toAccountId: "",
  dueDate: new Date().toISOString().slice(0, 10),
  amount: 0,
  description: "Transferência entre contas",
  status: "PAID",
  note: ""
};

export function TransferForm({ onSuccess }: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({ queryKey: ["accounts-transfer"], queryFn: getAccounts });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues
  });

  const accounts = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const fromAccountId = form.watch("fromAccountId");
  const destinationOptions = useMemo(
    () => accounts.filter((account) => account.id !== fromAccountId),
    [accounts, fromAccountId]
  );

  const transferMutation = useMutation({
    mutationFn: (values: FormValues) =>
      createTransfer({
        fromAccountId: values.fromAccountId,
        toAccountId: values.toAccountId,
        dueDate: values.dueDate,
        amount: Number(values.amount),
        description: values.description,
        status: values.status,
        note: values.note || undefined
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      form.reset(defaultValues);
      onSuccess?.();
    }
  });

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit((values) => transferMutation.mutate(values))}>
      <CardDescription>
        Use este formulário para mover valores entre suas contas sem perder rastreabilidade.
      </CardDescription>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm">Conta de origem</label>
          <Select {...form.register("fromAccountId")}>
            <option value="">Selecione</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-danger">{form.formState.errors.fromAccountId?.message}</p>
        </div>

        <div>
          <label className="mb-1 block text-sm">Conta de destino</label>
          <Select {...form.register("toAccountId")}>
            <option value="">Selecione</option>
            {destinationOptions.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-danger">{form.formState.errors.toAccountId?.message}</p>
        </div>

        <div>
          <label className="mb-1 block text-sm">Data</label>
          <Input type="date" {...form.register("dueDate")} />
        </div>

        <div>
          <label className="mb-1 block text-sm">Valor</label>
          <Input type="number" min="0" step="0.01" {...form.register("amount", { valueAsNumber: true })} />
          <p className="text-xs text-danger">{form.formState.errors.amount?.message}</p>
        </div>

        <div className="md:col-span-2">
          <label className="mb-1 block text-sm">Descrição</label>
          <Input {...form.register("description")} />
          <p className="text-xs text-danger">{form.formState.errors.description?.message}</p>
        </div>

        <div>
          <label className="mb-1 block text-sm">Como lançar</label>
          <Select {...form.register("status")}>
            <option value="PAID">Efetivar agora</option>
            <option value="PENDING">Agendar (pendente)</option>
          </Select>
        </div>

        <div>
          <label className="mb-1 block text-sm">Observação (opcional)</label>
          <Input placeholder="Ex.: ajuste de caixa" {...form.register("note")} />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={transferMutation.isPending}>
          {transferMutation.isPending ? "Salvando..." : "Salvar transferência"}
        </Button>
        {transferMutation.error ? (
          <p className="text-sm text-danger">
            {transferMutation.error instanceof Error ? transferMutation.error.message : "Falha ao transferir."}
          </p>
        ) : null}
      </div>
    </form>
  );
}

