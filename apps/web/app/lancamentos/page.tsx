"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, FilterX, Plus, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  cancelTransaction,
  effectivateTransaction,
  getTransactions,
  updateTransaction
} from "../../lib/api/endpoints";
import { Button } from "../../components/ui/button";
import { Card, CardDescription, CardTitle } from "../../components/ui/card";
import { Dialog } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { TransactionForm } from "../../components/transactions/transaction-form";
import { TransferForm } from "../../components/transactions/transfer-form";
import { type TransactionRow, TransactionsTable } from "../../components/transactions/transactions-table";
import { formatCurrency } from "../../lib/utils/format";

export default function LancamentosPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(searchParams.get("novo") === "1");
  const [transferFormOpen, setTransferFormOpen] = useState(false);
  const [effectivateTarget, setEffectivateTarget] = useState<TransactionRow | null>(null);
  const [editTarget, setEditTarget] = useState<TransactionRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<TransactionRow | null>(null);
  const [actualAmount, setActualAmount] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editBehavior, setEditBehavior] = useState<"FIXED" | "VARIABLE" | "PROVISION">("FIXED");

  const transactionsQuery = useQuery({
    queryKey: ["transactions", status, type, search],
    queryFn: () =>
      getTransactions({
        status,
        type: type || undefined,
        search: search || undefined,
        page: 1,
        pageSize: 100
      })
  });

  const rows = useMemo(() => transactionsQuery.data?.rows ?? [], [transactionsQuery.data]);

  const summary = useMemo(() => {
    const incomes = rows
      .filter((row) => row.type === "INCOME")
      .reduce((sum, row) => sum + (row.amountActual ?? row.amountPlanned), 0);
    const expenses = rows
      .filter((row) => row.type === "EXPENSE")
      .reduce((sum, row) => sum + (row.amountActual ?? row.amountPlanned), 0);
    const pendingCount = rows.filter((row) => row.status === "PENDING").length;
    const settledCount = rows.filter((row) => row.status === "PAID" || row.status === "RECEIVED").length;
    return { incomes, expenses, pendingCount, settledCount };
  }, [rows]);

  const hasFilters = status !== "" || type !== "" || search.trim() !== "";

  const effectivateMutation = useMutation({
    mutationFn: (payload: { id: string; keepAmount: boolean; actualAmount?: number }) =>
      effectivateTransaction(payload.id, {
        keepAmount: payload.keepAmount,
        actualAmount: payload.actualAmount
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      await queryClient.invalidateQueries({ queryKey: ["goals-dashboard"] });
      setEffectivateTarget(null);
      setActualAmount("");
    }
  });

  const updateMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      description: string;
      amountPlanned: number;
      dueDate: string;
      behavior: "FIXED" | "VARIABLE" | "PROVISION";
    }) =>
      updateTransaction(payload.id, {
        description: payload.description,
        amountPlanned: payload.amountPlanned,
        dueDate: payload.dueDate,
        behavior: payload.behavior,
        editMode: "THIS"
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      setEditTarget(null);
    }
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelTransaction(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      await queryClient.invalidateQueries({ queryKey: ["cashflow"] });
      await queryClient.invalidateQueries({ queryKey: ["reports"] });
      setCancelTarget(null);
    }
  });

  return (
    <section className="space-y-4">
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Filtros e busca</CardTitle>
            <CardDescription className="mt-1">Refine a lista para agir mais rapido nos pendentes.</CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasFilters ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setStatus("");
                  setType("");
                  setSearch("");
                }}
              >
                <FilterX size={14} className="mr-1" />
                Limpar filtros
              </Button>
            ) : null}
            <Button variant="secondary" onClick={() => setTransferFormOpen(true)}>
              <ArrowRightLeft size={15} className="mr-1" />
              Nova transferencia
            </Button>
            <Button onClick={() => setFormOpen(true)}>
              <Plus size={15} className="mr-1" />
              Novo lancamento
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-sm">Status</label>
            <Select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Todos</option>
              <option value="PENDING">Pendente</option>
              <option value="PAID">Pago</option>
              <option value="RECEIVED">Recebido</option>
              <option value="CANCELED">Cancelado</option>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm">Tipo</label>
            <Select value={type} onChange={(event) => setType(event.target.value)}>
              <option value="">Todos</option>
              <option value="INCOME">Entrada</option>
              <option value="EXPENSE">Saida</option>
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm">Busca rapida</label>
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Descricao, conta ou categoria"
                className="pl-9"
              />
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-success/25 bg-success/10">
          <CardDescription>Total de entradas</CardDescription>
          <CardTitle className="mt-1 text-2xl">{formatCurrency(summary.incomes)}</CardTitle>
        </Card>
        <Card className="border-danger/25 bg-danger/10">
          <CardDescription>Total de saidas</CardDescription>
          <CardTitle className="mt-1 text-2xl">{formatCurrency(summary.expenses)}</CardTitle>
        </Card>
        <Card className="border-warning/25 bg-warning/10">
          <CardDescription>Pendentes</CardDescription>
          <CardTitle className="mt-1 text-2xl">{summary.pendingCount}</CardTitle>
        </Card>
        <Card className="border-brand/25 bg-brand/10">
          <CardDescription>Efetivados</CardDescription>
          <CardTitle className="mt-1 text-2xl">{summary.settledCount}</CardTitle>
        </Card>
      </div>

      {transactionsQuery.isLoading ? (
        <Skeleton className="h-[520px] w-full" />
      ) : (
        <TransactionsTable
          rows={rows}
          onEffectivate={setEffectivateTarget}
          onEdit={(row) => {
            setEditTarget(row);
            setEditDescription(row.description);
            setEditAmount(String(row.amountPlanned));
            setEditDueDate(row.dueDate.slice(0, 10));
            setEditBehavior(row.behavior);
          }}
          onCancel={setCancelTarget}
          showSearch={false}
        />
      )}

      <Dialog open={formOpen} title="Novo lancamento" onClose={() => setFormOpen(false)} size="xl">
        <TransactionForm onSuccess={() => setFormOpen(false)} />
      </Dialog>

      <Dialog
        open={transferFormOpen}
        title="Nova transferencia entre contas"
        onClose={() => setTransferFormOpen(false)}
      >
        <TransferForm onSuccess={() => setTransferFormOpen(false)} />
      </Dialog>

      <Dialog
        open={!!effectivateTarget}
        title="Efetivar pagamento/recebimento"
        onClose={() => setEffectivateTarget(null)}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                if (!effectivateTarget) return;
                effectivateMutation.mutate({ id: effectivateTarget.id, keepAmount: true });
              }}
            >
              Manter valor
            </Button>
            <Button
              onClick={() => {
                if (!effectivateTarget) return;
                effectivateMutation.mutate({
                  id: effectivateTarget.id,
                  keepAmount: false,
                  actualAmount: Number(actualAmount)
                });
              }}
              disabled={!actualAmount}
            >
              Alterar valor
            </Button>
          </>
        }
      >
        {effectivateTarget ? (
          <div className="space-y-3">
            <p className="text-sm">
              Esse foi o valor pago/recebido mesmo para <strong>{effectivateTarget.description}</strong>?
            </p>
            <p className="text-sm text-muted">Valor previsto: {formatCurrency(effectivateTarget.amountPlanned)}</p>
            <div>
              <label className="mb-1 block text-sm">Valor real (se diferente)</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={actualAmount}
                onChange={(event) => setActualAmount(event.target.value)}
              />
            </div>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={!!editTarget}
        title="Editar lancamento"
        onClose={() => setEditTarget(null)}
        footer={
          <Button
            onClick={() => {
              if (!editTarget) return;
              updateMutation.mutate({
                id: editTarget.id,
                description: editDescription,
                amountPlanned: Number(editAmount),
                dueDate: editDueDate,
                behavior: editBehavior
              });
            }}
            disabled={!editDescription || !editAmount || !editDueDate || updateMutation.isPending}
          >
            Salvar alteracoes
          </Button>
        }
      >
        {editTarget ? (
          <div className="space-y-2">
            <Input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} />
            <Input
              type="number"
              min="0"
              step="0.01"
              value={editAmount}
              onChange={(event) => setEditAmount(event.target.value)}
            />
            <Input type="date" value={editDueDate} onChange={(event) => setEditDueDate(event.target.value)} />
            <Select
              value={editBehavior}
              onChange={(event) =>
                setEditBehavior(event.target.value as "FIXED" | "VARIABLE" | "PROVISION")
              }
            >
              <option value="FIXED">Fixo</option>
              <option value="VARIABLE">Variavel</option>
              <option value="PROVISION">Provisao</option>
            </Select>
          </div>
        ) : null}
      </Dialog>

      <Dialog
        open={!!cancelTarget}
        title="Cancelar lancamento"
        onClose={() => setCancelTarget(null)}
        footer={
          <Button
            variant="danger"
            onClick={() => {
              if (!cancelTarget) return;
              cancelMutation.mutate(cancelTarget.id);
            }}
            disabled={cancelMutation.isPending}
          >
            Confirmar cancelamento
          </Button>
        }
      >
        {cancelTarget ? (
          <p className="text-sm">
            Confirma cancelar o lancamento <strong>{cancelTarget.description}</strong>?
          </p>
        ) : null}
      </Dialog>
    </section>
  );
}
