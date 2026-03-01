"use client";

import { CalendarDays, LogOut, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { BellDot } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "../../lib/hooks/auth-provider";
import { getBudgetAlerts } from "../../lib/api/endpoints";
import { Button } from "../ui/button";
import { ThemeToggle } from "./theme-toggle";

const pageTitleByRoute: Record<string, string> = {
  "/": "Dashboard",
  "/fluxo-caixa": "Fluxo de Caixa",
  "/lancamentos": "Lancamentos",
  "/cartoes": "Cartoes",
  "/recebimentos-terceiros": "Recebimentos de terceiros",
  "/recorrencias": "Recorrencias",
  "/parcelamentos": "Parcelamentos",
  "/metas": "Metas Financeiras",
  "/relatorios": "Relatorios",
  "/importacoes": "Importacoes",
  "/contas": "Contas",
  "/partes": "Partes",
  "/categorias": "Categorias"
};

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const title = pageTitleByRoute[pathname] ?? "Controle Financeiro";
  const showGlobalNewTransaction = pathname !== "/lancamentos";
  const alertsQuery = useQuery({
    queryKey: ["budget-alerts-topbar"],
    queryFn: () => getBudgetAlerts(),
    refetchInterval: 60000
  });
  const activeAlertCount = alertsQuery.data?.length ?? 0;

  const todayLabel = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long"
  }).format(new Date());

  return (
    <header className="mb-4 rounded-2xl border border-border/70 bg-surface-elevated/80 p-3.5 shadow-soft backdrop-blur-sm sm:p-4 md:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="font-[var(--font-title)] text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
          <p className="mt-1 text-sm text-muted">{user?.name ? `Usuario: ${user.name}` : "Sem sessao ativa"}</p>
        </div>

        <div className="flex w-full items-center justify-center gap-2 rounded-xl border border-border/70 bg-surface-soft/70 px-3 py-2 text-sm text-muted sm:w-auto sm:justify-start">
          <CalendarDays size={15} />
          <span className="capitalize">{todayLabel}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs uppercase tracking-[0.18em] text-muted">Acoes rapidas</p>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          <Button
            className="w-full justify-center sm:w-auto"
            variant={activeAlertCount > 0 ? "secondary" : "ghost"}
            onClick={() => router.push("/")}
          >
            <BellDot size={16} className="mr-1" />
            Alertas {activeAlertCount > 0 ? `(${activeAlertCount})` : ""}
          </Button>
          <ThemeToggle className="self-end sm:self-auto" />
          {showGlobalNewTransaction ? (
            <Button className="w-full justify-center sm:w-auto" variant="secondary" onClick={() => router.push("/lancamentos?novo=1")}>
              <Plus size={16} className="mr-1" />
              Novo lancamento
            </Button>
          ) : null}
          <Button
            className="w-full justify-center sm:w-auto"
            variant="ghost"
            onClick={() => {
              logout();
              router.push("/login");
            }}
          >
            <LogOut size={16} className="mr-1" />
            Sair
          </Button>
        </div>
      </div>
    </header>
  );
}
