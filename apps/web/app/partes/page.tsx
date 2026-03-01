"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPartySchema } from "@financeiro/contracts";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "../../components/ui/button";
import { Card, CardDescription, CardTitle } from "../../components/ui/card";
import { Dialog } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Select } from "../../components/ui/select";
import { Skeleton } from "../../components/ui/skeleton";
import { createParty, deleteParty, getParties, updateParty } from "../../lib/api/endpoints";

const schema = createPartySchema;
type FormValues = z.infer<typeof schema>;

export default function PartesPage() {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);

  const partiesQuery = useQuery({ queryKey: ["parties"], queryFn: getParties });
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      type: "BOTH"
    }
  });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) => createParty(values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["parties"] });
      form.reset({ name: "", type: "BOTH" });
    }
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: string; values: FormValues }) => updateParty(payload.id, payload.values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["parties"] });
      setEditingId(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteParty(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["parties"] });
    }
  });

  const editingParty = (partiesQuery.data ?? []).find((item) => item.id === editingId) ?? null;
  const editForm = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: editingParty
      ? { name: editingParty.name, type: editingParty.type }
      : { name: "", type: "BOTH" }
  });

  if (partiesQuery.isLoading) {
    return (
      <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <Skeleton className="h-[300px] w-full" />
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-[120px] w-full" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
      <Card>
        <CardTitle>Nova parte</CardTitle>
        <CardDescription className="mt-1">
          Cadastre pagadores/recebedores para vincular aos lancamentos.
        </CardDescription>
        <form
          className="mt-3 space-y-2"
          onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
        >
          <Input placeholder="Nome da parte" {...form.register("name")} />
          <Select {...form.register("type")}>
            <option value="PAYER">Pagador</option>
            <option value="RECEIVER">Recebedor</option>
            <option value="BOTH">Ambos</option>
          </Select>
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Salvando..." : "Salvar parte"}
          </Button>
          {createMutation.error ? (
            <p className="text-sm text-danger">
              {createMutation.error instanceof Error ? createMutation.error.message : "Falha ao salvar."}
            </p>
          ) : null}
        </form>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        {(partiesQuery.data ?? []).map((party) => (
          <Card key={party.id}>
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>{party.name}</CardTitle>
                <CardDescription className="mt-1">
                  {party.type === "PAYER"
                    ? "Pagador"
                    : party.type === "RECEIVER"
                      ? "Recebedor"
                      : "Ambos"}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditingId(party.id)}>
                  Editar
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  onClick={() => deleteMutation.mutate(party.id)}
                  disabled={deleteMutation.isPending}
                >
                  Excluir
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Dialog
        open={!!editingParty}
        title="Editar parte"
        onClose={() => setEditingId(null)}
        footer={
          <Button
            onClick={editForm.handleSubmit((values) => {
              if (!editingParty) return;
              updateMutation.mutate({ id: editingParty.id, values });
            })}
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? "Salvando..." : "Salvar alteracoes"}
          </Button>
        }
      >
        {editingParty ? (
          <div className="space-y-2">
            <Input {...editForm.register("name")} />
            <Select {...editForm.register("type")}>
              <option value="PAYER">Pagador</option>
              <option value="RECEIVER">Recebedor</option>
              <option value="BOTH">Ambos</option>
            </Select>
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
