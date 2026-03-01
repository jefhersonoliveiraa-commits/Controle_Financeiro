"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createTransaction, getAccounts, getCategories, getParties } from "../../lib/api/endpoints";
import { Button } from "../ui/button";
import { CardDescription } from "../ui/card";
import { Input } from "../ui/input";
import { Select } from "../ui/select";

const formSchema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE"]),
    mode: z.enum(["FIXED", "VARIABLE", "PROVISION", "INSTALLMENT"]),
    description: z.string().min(2, "Informe uma descricao."),
    categoryId: z.string().uuid("Selecione uma categoria."),
    accountId: z.string().uuid("Selecione uma conta."),
    partyId: z.string().uuid("Parte invalida.").optional().or(z.literal("")),
    dueDate: z.string().min(1, "Informe a data."),
    amountPlanned: z.coerce.number().nonnegative("Valor invalido."),
    cardOwnership: z.enum(["SELF", "THIRD_PARTY"]).default("SELF"),
    note: z.string().max(500).optional(),
    costCenter: z.string().max(80).optional(),
    paymentMethod: z.string().max(40).optional(),
    provisionUntil: z.string().optional(),
    installment: z
      .object({
        totalAmount: z.coerce.number().nonnegative().optional(),
        installmentAmount: z.coerce.number().nonnegative().optional(),
        installments: z.coerce.number().int().min(2).max(240).optional(),
        firstDueDate: z.string().optional(),
        frequency: z.enum(["MONTHLY", "BIWEEKLY", "WEEKLY"]).default("MONTHLY"),
        variableInstallments: z.boolean().default(false)
      })
      .optional()
  })
  .superRefine((value, ctx) => {
    if (value.mode === "PROVISION" && !value.provisionUntil) {
      ctx.addIssue({
        path: ["provisionUntil"],
        code: z.ZodIssueCode.custom,
        message: "Informe ate quando esse lancamento sera provisionado."
      });
    }

    if (value.mode === "INSTALLMENT") {
      const installment = value.installment;
      if (!installment?.installments || !installment?.firstDueDate) {
        ctx.addIssue({
          path: ["installment"],
          code: z.ZodIssueCode.custom,
          message: "Preencha os dados de parcelamento."
        });
      }
      if (!installment?.totalAmount && !installment?.installmentAmount) {
        ctx.addIssue({
          path: ["installment"],
          code: z.ZodIssueCode.custom,
          message: "Informe valor total ou valor da parcela."
        });
      }
    }
  });

type FormValues = z.infer<typeof formSchema>;

function resolveCardInvoiceReference(dateInput: string, statementClosingDay: number) {
  const source = new Date(`${dateInput}T12:00:00.000Z`);
  const refDate =
    source.getUTCDate() <= statementClosingDay
      ? new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth(), 1))
      : new Date(Date.UTC(source.getUTCFullYear(), source.getUTCMonth() + 1, 1));

  return refDate.toISOString().slice(0, 7);
}

function resolveCardInvoiceDueDate(reference: string, statementDueDay: number) {
  const [yearRaw, monthRaw] = reference.split("-");
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  const dueMonthDate = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(
    Date.UTC(dueMonthDate.getUTCFullYear(), dueMonthDate.getUTCMonth() + 1, 0)
  ).getUTCDate();
  const day = Math.min(statementDueDay, lastDay);
  return new Date(Date.UTC(dueMonthDate.getUTCFullYear(), dueMonthDate.getUTCMonth(), day));
}

const defaultFormValues: FormValues = {
  type: "EXPENSE",
  mode: "FIXED",
  description: "",
  categoryId: "",
  accountId: "",
  partyId: "",
  dueDate: new Date().toISOString().slice(0, 10),
  amountPlanned: 0,
  cardOwnership: "SELF",
  note: "",
  costCenter: "",
  paymentMethod: "",
  provisionUntil: "",
  installment: {
    totalAmount: undefined,
    installmentAmount: undefined,
    installments: undefined,
    firstDueDate: new Date().toISOString().slice(0, 10),
    frequency: "MONTHLY",
    variableInstallments: false
  }
};

export function TransactionForm({ onSuccess }: { onSuccess?: () => void }) {
  const queryClient = useQueryClient();
  const accountsQuery = useQuery({ queryKey: ["accounts-form"], queryFn: getAccounts });
  const categoriesQuery = useQuery({ queryKey: ["categories-form"], queryFn: getCategories });
  const partiesQuery = useQuery({ queryKey: ["parties-form"], queryFn: getParties });

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: defaultFormValues
  });

  const mode = form.watch("mode");
  const transactionType = form.watch("type");
  const selectedAccountId = form.watch("accountId");
  const dueDateValue = form.watch("dueDate");
  const accountOptions = useMemo(() => accountsQuery.data ?? [], [accountsQuery.data]);
  const categoryOptions = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const partyOptions = useMemo(() => partiesQuery.data ?? [], [partiesQuery.data]);
  const selectedAccount = accountOptions.find((account) => account.id === selectedAccountId);
  const isCreditCardExpense = transactionType === "EXPENSE" && selectedAccount?.type === "CREDIT_CARD";
  const cardInvoicePreview = useMemo(() => {
    if (!isCreditCardExpense || !selectedAccount || !dueDateValue) {
      return null;
    }
    if (!selectedAccount.statementClosingDay || !selectedAccount.statementDueDay) {
      return {
        blocked: true as const
      };
    }

    const reference = resolveCardInvoiceReference(dueDateValue, selectedAccount.statementClosingDay);
    const dueDate = resolveCardInvoiceDueDate(reference, selectedAccount.statementDueDay);

    return {
      blocked: false as const,
      reference,
      dueDate
    };
  }, [dueDateValue, isCreditCardExpense, selectedAccount]);

  useEffect(() => {
    if (mode !== "PROVISION") {
      form.setValue("provisionUntil", "");
    }
  }, [form, mode]);

  useEffect(() => {
    if (!isCreditCardExpense) {
      form.setValue("cardOwnership", "SELF");
    }
  }, [form, isCreditCardExpense]);

  const createMutation = useMutation({
    mutationFn: (values: FormValues) => {
      const isInstallment = values.mode === "INSTALLMENT";
      const behavior =
        values.mode === "INSTALLMENT"
          ? values.installment?.variableInstallments
            ? "VARIABLE"
            : "FIXED"
          : values.mode;

      return createTransaction({
        type: values.type,
        description: values.description,
        categoryId: values.categoryId,
        accountId: values.accountId,
        partyId: values.partyId || undefined,
        dueDate: values.dueDate,
        amountPlanned: Number(values.amountPlanned),
        cardOwnership: isCreditCardExpense ? values.cardOwnership : "SELF",
        status: "PENDING",
        behavior,
        note: values.note || undefined,
        costCenter: values.costCenter || undefined,
        paymentMethod: values.paymentMethod || undefined,
        provisionUntil: values.mode === "PROVISION" ? values.provisionUntil : undefined,
        isInstallment,
        installment: isInstallment
          ? {
              totalAmount: values.installment?.totalAmount,
              installmentAmount: values.installment?.installmentAmount,
              installments: Number(values.installment?.installments ?? 0),
              firstDueDate: values.installment?.firstDueDate,
              frequency: values.installment?.frequency ?? "MONTHLY",
              variableInstallments: values.installment?.variableInstallments ?? false
            }
          : undefined
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      await queryClient.invalidateQueries({ queryKey: ["installment-plans"] });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      await queryClient.invalidateQueries({ queryKey: ["card-statement"] });
      form.reset(defaultFormValues);
      onSuccess?.();
    }
  });

  return (
    <form className="space-y-4" onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}>
      <CardDescription>
        Defina o comportamento do lancamento e o formulario se adapta automaticamente.
      </CardDescription>

      <div className="rounded-xl border border-border bg-surface-soft/80 p-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium">Tipo</label>
            <Select {...form.register("type")}>
              <option value="INCOME">Entrada</option>
              <option value="EXPENSE">Saida</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Comportamento</label>
            <Select {...form.register("mode")}>
              <option value="FIXED">Fixo</option>
              <option value="VARIABLE">Variavel</option>
              <option value="PROVISION">Provisao</option>
              <option value="INSTALLMENT">Parcelado</option>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm">Descricao</label>
          <Input placeholder="Ex.: Conta de energia" {...form.register("description")} />
          <p className="text-xs text-danger">{form.formState.errors.description?.message}</p>
        </div>
        <div>
          <label className="mb-1 block text-sm">Categoria</label>
          <Select {...form.register("categoryId")}>
            <option value="">Selecione</option>
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-danger">{form.formState.errors.categoryId?.message}</p>
        </div>
        <div>
          <label className="mb-1 block text-sm">Conta</label>
          <Select {...form.register("accountId")}>
            <option value="">Selecione</option>
            {accountOptions.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
          <p className="text-xs text-danger">{form.formState.errors.accountId?.message}</p>
        </div>
        <div>
          <label className="mb-1 block text-sm">Parte (opcional)</label>
          <Select {...form.register("partyId")}>
            <option value="">Selecione</option>
            {partyOptions.map((party) => (
              <option key={party.id} value={party.id}>
                {party.name}
              </option>
            ))}
          </Select>
        </div>
        {isCreditCardExpense ? (
          <div>
            <label className="mb-1 block text-sm">Despesa de quem?</label>
            <Select {...form.register("cardOwnership")}>
              <option value="SELF">Minha</option>
              <option value="THIRD_PARTY">De terceiros</option>
            </Select>
          </div>
        ) : null}
        <div>
          <label className="mb-1 block text-sm">
            {isCreditCardExpense ? "Data da compra/lancamento" : "Data de vencimento"}
          </label>
          <Input type="date" {...form.register("dueDate")} />
          {isCreditCardExpense ? (
            <p className="mt-1 text-xs text-muted">
              {cardInvoicePreview?.blocked
                ? "Configure fechamento e vencimento do cartao para visualizar a fatura."
                : cardInvoicePreview
                  ? `Vai para a fatura ${cardInvoicePreview.reference} (vencimento ${cardInvoicePreview.dueDate?.toLocaleDateString("pt-BR") ?? "--"}).`
                  : null}
            </p>
          ) : null}
        </div>
        <div>
          <label className="mb-1 block text-sm">Valor previsto</label>
          <Input
            type="number"
            min="0"
            step="0.01"
            {...form.register("amountPlanned", { valueAsNumber: true })}
          />
          <p className="text-xs text-danger">{form.formState.errors.amountPlanned?.message}</p>
        </div>
      </div>

      {mode === "PROVISION" ? (
        <div className="rounded-xl border border-brand/20 bg-brand/5 p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Provisionar ate</label>
              <Input type="date" {...form.register("provisionUntil")} />
              <p className="text-xs text-danger">{form.formState.errors.provisionUntil?.message}</p>
            </div>
          </div>
        </div>
      ) : null}

      {mode === "INSTALLMENT" ? (
        <div className="rounded-xl border border-border bg-surface-soft p-3">
          <p className="mb-2 text-sm font-semibold">Configuracoes do parcelamento</p>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm">Valor total</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                {...form.register("installment.totalAmount", { valueAsNumber: true })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm">Valor da parcela</label>
              <Input
                type="number"
                min="0"
                step="0.01"
                {...form.register("installment.installmentAmount", { valueAsNumber: true })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm">Quantidade de parcelas</label>
              <Input
                type="number"
                min="2"
                max="240"
                {...form.register("installment.installments", { valueAsNumber: true })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm">Data da primeira parcela</label>
              <Input type="date" {...form.register("installment.firstDueDate")} />
            </div>
            <div>
              <label className="mb-1 block text-sm">Frequencia</label>
              <Select {...form.register("installment.frequency")}>
                <option value="MONTHLY">Mensal</option>
                <option value="BIWEEKLY">Quinzenal</option>
                <option value="WEEKLY">Semanal</option>
              </Select>
            </div>
            <label className="inline-flex items-center gap-2 text-sm md:pt-7">
              <input type="checkbox" {...form.register("installment.variableInstallments")} />
              Parcelas variaveis
            </label>
          </div>
          <p className="mt-2 text-xs text-danger">{form.formState.errors.installment?.message as string}</p>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm">Forma de pagamento (opcional)</label>
          <Input placeholder="PIX, debito, credito, boleto..." {...form.register("paymentMethod")} />
        </div>
        <div>
          <label className="mb-1 block text-sm">Centro de custo (opcional)</label>
          <Input placeholder="Ex.: Casa, empresa..." {...form.register("costCenter")} />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-sm">Observacao (opcional)</label>
          <Input placeholder="Detalhes extras..." {...form.register("note")} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={createMutation.isPending}>
          {createMutation.isPending ? "Salvando..." : "Salvar lancamento"}
        </Button>
        {createMutation.error ? (
          <p className="text-sm text-danger">
            {createMutation.error instanceof Error ? createMutation.error.message : "Falha ao salvar."}
          </p>
        ) : null}
      </div>
    </form>
  );
}
