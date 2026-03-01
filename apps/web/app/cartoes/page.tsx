"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardDescription, CardTitle } from "../../components/ui/card";
import { Dialog } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { getAccounts, getCardStatement, payCardInvoice } from "../../lib/api/endpoints";
import { formatCurrency, formatDate } from "../../lib/utils/format";
import { formatStatus } from "../../lib/utils/i18n";

type StatementRow = {
  id: string;
  description: string;
  type: "INCOME" | "EXPENSE";
  status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
  dueDate: string;
  amountPlanned: number;
  amountActual: number | null;
  cardSettledAmount?: number;
  ownAmount: number;
  thirdPartyAmount: number;
  thirdPartyPending: number;
  category: { id: string; name: string; color: string };
};

type StatementInvoice = {
  id: string;
  accountId: string;
  reference: string;
  cycleStart: string;
  cycleEnd: string;
  dueDate: string;
  totalAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: "OPEN" | "PARTIALLY_PAID" | "PAID";
};

type StatementPayment = {
  id: string;
  fromAccountId: string | null;
  paidAt: string;
  amount: number;
  note: string | null;
  origin: "MANUAL" | "MIGRATION";
};

function statusTone(status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED") {
  if (status === "PENDING") return "warning" as const;
  if (status === "CANCELED") return "danger" as const;
  return "success" as const;
}

function invoiceTone(status: "OPEN" | "PARTIALLY_PAID" | "PAID") {
  if (status === "PAID") return "success" as const;
  if (status === "PARTIALLY_PAID") return "warning" as const;
  return "danger" as const;
}

function invoiceStatusLabel(status: "OPEN" | "PARTIALLY_PAID" | "PAID") {
  if (status === "PAID") return "Quitada";
  if (status === "PARTIALLY_PAID") return "Parcial";
  return "Aberta";
}

export default function CartoesPage() {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState("");
  const [reference, setReference] = useState(format(new Date(), "yyyy-MM"));
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [paymentFromAccountId, setPaymentFromAccountId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentError, setPaymentError] = useState("");

  const accountsQuery = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const cardAccounts = useMemo(
    () => (accountsQuery.data ?? []).filter((account) => account.type === "CREDIT_CARD"),
    [accountsQuery.data]
  );
  const paymentSourceAccounts = useMemo(
    () =>
      (accountsQuery.data ?? []).filter(
        (account) => account.type === "BANK_ACCOUNT" || account.type === "CASH"
      ),
    [accountsQuery.data]
  );
  const accountNameById = useMemo(
    () => new Map((accountsQuery.data ?? []).map((account) => [account.id, account.name])),
    [accountsQuery.data]
  );

  useEffect(() => {
    if (!accountId && cardAccounts.length > 0) {
      setAccountId(cardAccounts[0].id);
    }
  }, [accountId, cardAccounts]);

  useEffect(() => {
    if (!paymentFromAccountId && paymentSourceAccounts.length > 0) {
      setPaymentFromAccountId(paymentSourceAccounts[0].id);
    }
  }, [paymentFromAccountId, paymentSourceAccounts]);

  const statementQuery = useQuery({
    queryKey: ["card-statement", accountId, reference],
    queryFn: () => getCardStatement({ accountId, reference }),
    enabled: !!accountId
  });

  const paymentMutation = useMutation({
    mutationFn: (payload: {
      invoiceId: string;
      fromAccountId: string;
      amount: number;
      paidAt: string;
      note?: string;
    }) =>
      payCardInvoice(
        { accountId, invoiceId: payload.invoiceId },
        {
          fromAccountId: payload.fromAccountId,
          amount: payload.amount,
          paidAt: payload.paidAt,
          note: payload.note
        }
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["card-statement", accountId, reference] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      setPaymentDialogOpen(false);
      setPaymentError("");
      setPaymentNote("");
      setPaymentDate(new Date().toISOString().slice(0, 10));
    }
  });

  const statement = statementQuery.data;
  const invoice = (statement?.invoice ?? null) as StatementInvoice | null;
  const rows = (statement?.rows ?? []) as StatementRow[];
  const payments = ((statement?.payments ?? []) as StatementPayment[])
    .slice()
    .sort((left, right) => right.paidAt.localeCompare(left.paidAt));

  useEffect(() => {
    if (!paymentDialogOpen || !invoice) return;
    setPaymentAmount(invoice.outstandingAmount > 0 ? invoice.outstandingAmount.toFixed(2) : "");
    setPaymentError("");
  }, [invoice, paymentDialogOpen]);

  if (accountsQuery.isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-[180px] w-full" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-[110px] w-full" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <Card>
        <CardTitle>Cartoes</CardTitle>
        <CardDescription>Pagamento por fatura e visao de progresso por item.</CardDescription>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm">Cartao</label>
            <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">Selecione</option>
              {cardAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-sm">Referencia da fatura</label>
            <Input type="month" value={reference} onChange={(event) => setReference(event.target.value)} />
          </div>
        </div>
      </Card>

      {cardAccounts.length === 0 ? (
        <Card>
          <CardDescription>Nenhuma conta do tipo cartao de credito foi cadastrada.</CardDescription>
        </Card>
      ) : null}

      {statementQuery.isError && accountId ? (
        <Card className="border-danger/35 bg-danger/10">
          <CardTitle className="text-base">Configuracao pendente do cartao</CardTitle>
          <CardDescription className="mt-1">
            {statementQuery.error instanceof Error
              ? statementQuery.error.message
              : "Nao foi possivel carregar a fatura."}
          </CardDescription>
          <div className="mt-3">
            <Link href="/contas" className="text-sm font-medium text-brand underline underline-offset-4">
              Ir para contas e configurar fechamento/vencimento
            </Link>
          </div>
        </Card>
      ) : null}

      {statementQuery.isLoading && accountId ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-[110px] w-full" />
          ))}
        </div>
      ) : statement && invoice ? (
        <>
          <Card className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Fatura {invoice.reference}</CardTitle>
                <CardDescription>
                  Ciclo: {formatDate(invoice.cycleStart.slice(0, 10))} ate {formatDate(invoice.cycleEnd.slice(0, 10))}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={invoiceTone(invoice.status)}>{invoiceStatusLabel(invoice.status)}</Badge>
                <Button
                  onClick={() => setPaymentDialogOpen(true)}
                  disabled={invoice.outstandingAmount <= 0.009 || paymentSourceAccounts.length === 0}
                >
                  Pagar fatura
                </Button>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card>
                <CardDescription>Total</CardDescription>
                <CardTitle className="mt-1 text-2xl">{formatCurrency(invoice.totalAmount)}</CardTitle>
              </Card>
              <Card>
                <CardDescription>Pago</CardDescription>
                <CardTitle className="mt-1 text-2xl">{formatCurrency(invoice.paidAmount)}</CardTitle>
              </Card>
              <Card>
                <CardDescription>Saldo</CardDescription>
                <CardTitle className="mt-1 text-2xl">{formatCurrency(invoice.outstandingAmount)}</CardTitle>
              </Card>
              <Card>
                <CardDescription>Vencimento</CardDescription>
                <CardTitle className="mt-1 text-2xl">{formatDate(invoice.dueDate.slice(0, 10))}</CardTitle>
              </Card>
            </div>
          </Card>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardDescription>Gastos meus</CardDescription>
              <CardTitle className="mt-1 text-2xl">{formatCurrency(statement.totals.ownExpenses)}</CardTitle>
            </Card>
            <Card>
              <CardDescription>Gastos de terceiros</CardDescription>
              <CardTitle className="mt-1 text-2xl">{formatCurrency(statement.totals.thirdPartyExpenses)}</CardTitle>
            </Card>
            <Card>
              <CardDescription>Pendente de terceiros</CardDescription>
              <CardTitle className="mt-1 text-2xl">{formatCurrency(statement.totals.thirdPartyPending)}</CardTitle>
            </Card>
          </div>
        </>
      ) : null}

      <Card>
        <CardTitle className="mb-3 text-base">Historico de pagamentos da fatura</CardTitle>
        {!payments.length ? (
          <CardDescription>Nenhum pagamento registrado para esta fatura.</CardDescription>
        ) : (
          <div className="space-y-2">
            {payments.map((payment) => (
              <div key={payment.id} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold">{formatCurrency(payment.amount)}</p>
                    <p className="text-xs text-muted">
                      {formatDate(payment.paidAt.slice(0, 10))} |{" "}
                      {payment.fromAccountId
                        ? accountNameById.get(payment.fromAccountId) ?? "Conta"
                        : "Migracao"}
                    </p>
                    {payment.note ? <p className="mt-1 text-xs text-muted">{payment.note}</p> : null}
                  </div>
                  <Badge tone={payment.origin === "MANUAL" ? "neutral" : "warning"}>
                    {payment.origin === "MANUAL" ? "Manual" : "Migracao"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle className="mb-3 text-base">Itens da fatura</CardTitle>
        {!accountId ? (
          <CardDescription>Selecione um cartao para visualizar a fatura.</CardDescription>
        ) : statementQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[120px] w-full" />
            ))}
          </div>
        ) : rows.length ? (
          <div className="space-y-2">
            {rows.map((row) => {
              const resolvedAmount =
                (row.status === "PAID" || row.status === "RECEIVED") && row.amountActual !== null
                  ? row.amountActual
                  : row.amountPlanned;
              const settled = Math.max(0, Math.min(row.amountPlanned, row.cardSettledAmount ?? 0));
              const settledPercent = row.amountPlanned > 0 ? Math.min(100, (settled / row.amountPlanned) * 100) : 0;

              return (
                <div key={row.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold">{row.description}</p>
                      <p className="text-xs text-muted">
                        {formatDate(row.dueDate.slice(0, 10))} | {row.category.name}
                      </p>
                    </div>
                    <p className={row.type === "INCOME" ? "font-semibold text-success" : "font-semibold text-danger"}>
                      {formatCurrency(resolvedAmount)}
                    </p>
                  </div>

                  {row.type === "EXPENSE" ? (
                    <div className="mt-2">
                      <div className="mb-1 flex items-center justify-between text-xs text-muted">
                        <span>Liquidado por fatura</span>
                        <span>
                          {formatCurrency(settled)} / {formatCurrency(row.amountPlanned)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-soft">
                        <div className="h-full rounded-full bg-brand" style={{ width: `${settledPercent}%` }} />
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={statusTone(row.status)}>{formatStatus(row.status)}</Badge>
                    {row.type === "EXPENSE" ? (
                      <>
                        <Badge tone="success">Meu: {formatCurrency(row.ownAmount)}</Badge>
                        <Badge tone="warning">Terceiros: {formatCurrency(row.thirdPartyAmount)}</Badge>
                        {row.thirdPartyAmount > 0 ? (
                          <Badge tone={row.thirdPartyPending > 0 ? "warning" : "success"}>
                            {row.thirdPartyPending > 0
                              ? `A receber: ${formatCurrency(row.thirdPartyPending)}`
                              : "Terceiros quitados"}
                          </Badge>
                        ) : null}
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <CardDescription>Nenhum lancamento encontrado para a fatura selecionada.</CardDescription>
        )}
      </Card>

      <Dialog
        open={paymentDialogOpen}
        title="Pagar fatura"
        onClose={() => setPaymentDialogOpen(false)}
        footer={
          <Button
            onClick={() => {
              if (!invoice) {
                setPaymentError("Fatura nao encontrada.");
                return;
              }
              const amount = Number(paymentAmount);
              if (!paymentFromAccountId) {
                setPaymentError("Selecione a conta de origem.");
                return;
              }
              if (!Number.isFinite(amount) || amount <= 0) {
                setPaymentError("Informe um valor maior que zero.");
                return;
              }
              if (amount - invoice.outstandingAmount > 0.009) {
                setPaymentError("Valor maior que o saldo da fatura.");
                return;
              }
              setPaymentError("");
              paymentMutation.mutate({
                invoiceId: invoice.id,
                fromAccountId: paymentFromAccountId,
                amount,
                paidAt: paymentDate,
                note: paymentNote || undefined
              });
            }}
            disabled={paymentMutation.isPending || !invoice}
          >
            {paymentMutation.isPending ? "Processando..." : "Confirmar pagamento"}
          </Button>
        }
      >
        <div className="space-y-3">
          {invoice ? (
            <p className="text-sm text-muted">
              Saldo atual: <strong>{formatCurrency(invoice.outstandingAmount)}</strong>
            </p>
          ) : null}
          <div>
            <label className="mb-1 block text-sm">Conta de origem</label>
            <Select
              value={paymentFromAccountId}
              onChange={(event) => setPaymentFromAccountId(event.target.value)}
            >
              <option value="">Selecione</option>
              {paymentSourceAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm">Data do pagamento</label>
            <Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Valor</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={paymentAmount}
              onChange={(event) => setPaymentAmount(event.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm">Observacao (opcional)</label>
            <Input value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} />
          </div>
          {paymentError ? <p className="text-sm text-danger">{paymentError}</p> : null}
          {paymentMutation.error ? (
            <p className="text-sm text-danger">
              {paymentMutation.error instanceof Error ? paymentMutation.error.message : "Falha ao pagar."}
            </p>
          ) : null}
        </div>
      </Dialog>
    </section>
  );
}
