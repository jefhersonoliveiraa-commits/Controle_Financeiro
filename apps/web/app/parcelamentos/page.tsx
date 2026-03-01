"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardDescription, CardTitle } from "../../components/ui/card";
import { Dialog } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { apiRequest } from "../../lib/api/client";
import { getInstallmentPlanDetails, getInstallmentPlans } from "../../lib/api/endpoints";
import { formatCurrency, formatDate } from "../../lib/utils/format";
import { formatBehavior, formatFrequency, formatStatus } from "../../lib/utils/i18n";

export default function ParcelamentosPage() {
  const queryClient = useQueryClient();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [targetInstallment, setTargetInstallment] = useState<{ id: string; dueDate: string; description: string } | null>(
    null
  );
  const [newDueDate, setNewDueDate] = useState("");

  const plansQuery = useQuery({
    queryKey: ["installment-plans"],
    queryFn: getInstallmentPlans
  });

  const detailsQuery = useQuery({
    queryKey: ["installment-plan-details", selectedPlanId],
    queryFn: () => getInstallmentPlanDetails(selectedPlanId!),
    enabled: !!selectedPlanId
  });

  const anticipateMutation = useMutation({
    mutationFn: (payload: { id: string; dueDate: string }) =>
      apiRequest(`/transactions/${payload.id}/anticipate`, {
        method: "PATCH",
        body: JSON.stringify({ dueDate: payload.dueDate })
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["installment-plans"] });
      await queryClient.invalidateQueries({ queryKey: ["installment-plan-details", selectedPlanId] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      setTargetInstallment(null);
      setNewDueDate("");
    }
  });

  const selectedPlan = useMemo(() => detailsQuery.data, [detailsQuery.data]);

  return (
    <section className="space-y-4 pb-2">
      <Card>
        <CardTitle>Parcelamentos</CardTitle>
        <CardDescription>
          Consulte os planos criados, acompanhe o progresso e visualize cada parcela.
        </CardDescription>
      </Card>

      {plansQuery.data?.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {plansQuery.data.map((plan) => (
            <button
              key={plan.planId}
              className="rounded-xl border border-border bg-surface p-4 text-left shadow-soft transition hover:border-brand/40"
              onClick={() => setSelectedPlanId(plan.planId)}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{plan.description}</p>
                  <p className="text-sm text-muted">
                    {plan.installments} parcelas | {formatFrequency(plan.frequency)}
                  </p>
                </div>
                <Badge tone={plan.summary.pendingCount > 0 ? "warning" : "success"}>
                  {plan.summary.progressPercent}%
                </Badge>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-brand"
                  style={{ width: `${Math.min(plan.summary.progressPercent, 100)}%` }}
                />
              </div>
              <div className="mt-3 grid gap-1 text-sm">
                <p>Total planejado: {formatCurrency(plan.totalAmount)}</p>
                <p>Total pago: {formatCurrency(plan.summary.paidTotal)}</p>
                <p>Restante: {formatCurrency(plan.summary.remainingTotal)}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Card>
          <CardDescription>Nenhum parcelamento encontrado até o momento.</CardDescription>
        </Card>
      )}

      <Dialog open={!!selectedPlanId} title="Detalhes do parcelamento" onClose={() => setSelectedPlanId(null)}>
        {!selectedPlan ? (
          <p className="text-sm text-muted">Carregando detalhes...</p>
        ) : (
          <div className="space-y-3">
            <div>
              <p className="font-semibold">{selectedPlan.description}</p>
              <p className="text-sm text-muted">Conta: {selectedPlan.account.name}</p>
              <p className="text-sm text-muted">Categoria: {selectedPlan.category.name}</p>
            </div>

            <div className="grid gap-2 text-sm sm:grid-cols-2">
              <p>Parcelas: {selectedPlan.installments}</p>
              <p>Frequência: {formatFrequency(selectedPlan.frequency)}</p>
              <p>Total: {formatCurrency(selectedPlan.totalAmount)}</p>
              <p>Total pago: {formatCurrency(selectedPlan.summary.paidTotal)}</p>
              <p>Restante: {formatCurrency(selectedPlan.summary.remainingTotal)}</p>
              <p>
                Próxima parcela:{" "}
                {selectedPlan.nextInstallment
                  ? formatDate(selectedPlan.nextInstallment.dueDate.slice(0, 10))
                  : "Sem pendências"}
              </p>
            </div>

            <div className="h-2 overflow-hidden rounded-full bg-border">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${Math.min(selectedPlan.summary.progressPercent, 100)}%` }}
              />
            </div>

            <div className="space-y-2">
              {selectedPlan.transactions.map((item) => (
                <div key={item.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      Parcela {item.installmentNumber}/{item.installmentTotal}
                    </p>
                    <p className={item.type === "INCOME" ? "text-success" : "text-danger"}>
                      {formatCurrency(item.amountActual ?? item.amountPlanned)}
                    </p>
                  </div>
                  <p className="text-xs text-muted">
                    Vencimento: {formatDate(item.dueDate.slice(0, 10))} | {formatBehavior(item.behavior)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={item.status === "PENDING" ? "warning" : item.status === "CANCELED" ? "danger" : "success"}>
                      {formatStatus(item.status)}
                    </Badge>
                    {item.status === "PENDING" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setTargetInstallment({
                            id: item.id,
                            dueDate: item.dueDate,
                            description: item.description
                          })
                        }
                      >
                        Antecipar
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!targetInstallment}
        title="Antecipar parcela"
        onClose={() => setTargetInstallment(null)}
        footer={
          <Button
            onClick={() => {
              if (!targetInstallment || !newDueDate) return;
              anticipateMutation.mutate({ id: targetInstallment.id, dueDate: newDueDate });
            }}
            disabled={!newDueDate || anticipateMutation.isPending}
          >
            Confirmar antecipação
          </Button>
        }
      >
        {targetInstallment ? (
          <div className="space-y-2">
            <p className="text-sm">{targetInstallment.description}</p>
            <p className="text-sm text-muted">
              Vencimento atual: {formatDate(targetInstallment.dueDate.slice(0, 10))}
            </p>
            <Input type="date" value={newDueDate} onChange={(event) => setNewDueDate(event.target.value)} />
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
