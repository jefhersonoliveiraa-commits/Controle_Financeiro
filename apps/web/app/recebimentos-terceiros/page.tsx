"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardDescription, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import {
  getParties,
  getThirdPartyReceivables,
  updateCardSplits
} from "../../lib/api/endpoints";
import { formatCurrency, formatDate } from "../../lib/utils/format";

type ReceivableStatus = "PENDING" | "RECEIVED" | "OVERDUE";

function statusTone(status: ReceivableStatus) {
  if (status === "RECEIVED") return "success" as const;
  if (status === "OVERDUE") return "danger" as const;
  return "warning" as const;
}

function statusLabel(status: ReceivableStatus) {
  if (status === "RECEIVED") return "Recebido";
  if (status === "OVERDUE") return "Atrasado";
  return "Pendente";
}

export default function RecebimentosTerceirosPage() {
  const queryClient = useQueryClient();
  const [reference, setReference] = useState(format(new Date(), "yyyy-MM"));
  const [statusFilter, setStatusFilter] = useState<"ALL" | "PENDING" | "RECEIVED" | "OVERDUE">("ALL");
  const [partyId, setPartyId] = useState("");

  const partiesQuery = useQuery({ queryKey: ["parties-receivables"], queryFn: getParties });
  const receivablesQuery = useQuery({
    queryKey: ["third-party-receivables", reference, statusFilter, partyId],
    queryFn: () =>
      getThirdPartyReceivables({
        reference,
        status: statusFilter,
        partyId: partyId || undefined
      })
  });

  const toggleMutation = useMutation({
    mutationFn: (payload: {
      transactionId: string;
      splitId: string;
      splitPartyId: string | null;
      status: ReceivableStatus;
      splits: Array<{
        id: string;
        ownerType: "SELF" | "THIRD_PARTY";
        amount: number;
        partyId: string | null;
        receivedAt: string | null;
      }>;
    }) => {
      if (!payload.splitPartyId) {
        throw new Error("Esse recebimento precisa de uma parte vinculada antes da baixa.");
      }

      const shouldMarkAsReceived = payload.status !== "RECEIVED";
      return updateCardSplits(payload.transactionId, {
        splits: payload.splits.map((split) => {
          if (split.ownerType === "THIRD_PARTY") {
            const receivedAt =
              split.id === payload.splitId
                ? shouldMarkAsReceived
                  ? new Date().toISOString()
                  : undefined
                : split.receivedAt ?? undefined;
            return {
              ownerType: split.ownerType,
              amount: Number(split.amount.toFixed(2)),
              partyId: split.partyId ?? undefined,
              receivedAt
            };
          }

          return {
            ownerType: split.ownerType,
            amount: Number(split.amount.toFixed(2))
          };
        })
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["third-party-receivables"] });
      await queryClient.invalidateQueries({ queryKey: ["card-statement"] });
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
    }
  });

  return (
    <section className="space-y-4">
      <Card>
        <CardTitle>Recebimentos de terceiros</CardTitle>
        <CardDescription>
          Acompanhe o que ja recebeu no mes, o que falta receber e faça a baixa rapidamente.
        </CardDescription>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-sm">Mes de referencia</label>
            <Input type="month" value={reference} onChange={(event) => setReference(event.target.value)} />
          </div>
          <div>
            <label className="mb-1 block text-sm">Status</label>
            <Select
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as "ALL" | "PENDING" | "RECEIVED" | "OVERDUE")
              }
            >
              <option value="ALL">Todos</option>
              <option value="PENDING">Pendentes</option>
              <option value="OVERDUE">Atrasados</option>
              <option value="RECEIVED">Recebidos</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm">Parte</label>
            <Select value={partyId} onChange={(event) => setPartyId(event.target.value)}>
              <option value="">Todas</option>
              {(partiesQuery.data ?? []).map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {receivablesQuery.isLoading ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-[110px] w-full" />
            ))}
          </div>
          <Skeleton className="h-[420px] w-full" />
        </>
      ) : receivablesQuery.data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card>
              <CardDescription>Total de terceiros no mes</CardDescription>
              <CardTitle className="mt-1 text-2xl">
                {formatCurrency(receivablesQuery.data.totals.totalThirdParty)}
              </CardTitle>
            </Card>
            <Card>
              <CardDescription>Total recebido</CardDescription>
              <CardTitle className="mt-1 text-2xl text-success">
                {formatCurrency(receivablesQuery.data.totals.totalReceived)}
              </CardTitle>
            </Card>
            <Card>
              <CardDescription>Falta receber</CardDescription>
              <CardTitle className="mt-1 text-2xl text-warning">
                {formatCurrency(receivablesQuery.data.totals.totalPending)}
              </CardTitle>
            </Card>
            <Card>
              <CardDescription>Atrasados / vencem em 7 dias</CardDescription>
              <CardTitle className="mt-1 text-2xl">
                {receivablesQuery.data.totals.overdueCount} / {receivablesQuery.data.totals.dueThisWeekCount}
              </CardTitle>
            </Card>
          </div>

          <Card>
            <CardTitle className="mb-2 text-base">Linhas a receber</CardTitle>
            <CardDescription className="mb-3">
              {receivablesQuery.data.rows.length} item(ns) para o filtro atual.
            </CardDescription>

            {receivablesQuery.data.rows.length ? (
              <div className="space-y-2">
                {receivablesQuery.data.rows.map((row) => (
                  <div key={row.id} className="rounded-xl border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <p className="font-semibold">{row.description}</p>
                        <p className="text-xs text-muted">
                          {row.party?.name ?? "Sem parte"} | {row.account.name} | {row.category.name}
                        </p>
                        <p className="text-xs text-muted">Vencimento: {formatDate(row.dueDate.slice(0, 10))}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold">{formatCurrency(row.amount)}</p>
                        <Badge tone={statusTone(row.status)}>{statusLabel(row.status)}</Badge>
                        {row.receivedAt ? (
                          <p className="mt-1 text-xs text-muted">
                            Recebido em {formatDate(row.receivedAt.slice(0, 10))}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant={row.status === "RECEIVED" ? "secondary" : "ghost"}
                        disabled={toggleMutation.isPending || !row.party?.id}
                        onClick={() =>
                          toggleMutation.mutate({
                            transactionId: row.transactionId,
                            splitId: row.splitId,
                            splitPartyId: row.party?.id ?? null,
                            status: row.status,
                            splits: row.splits
                          })
                        }
                      >
                        {row.status === "RECEIVED" ? "Desfazer recebimento" : "Marcar como recebido"}
                      </Button>
                      {!row.party?.id ? (
                        <span className="text-xs text-danger">Vincule uma parte para controlar a baixa.</span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">Nenhum recebimento encontrado com os filtros selecionados.</p>
            )}
          </Card>
        </>
      ) : (
        <Card>
          <CardDescription>Nao foi possivel carregar os recebimentos de terceiros.</CardDescription>
        </Card>
      )}
    </section>
  );
}
