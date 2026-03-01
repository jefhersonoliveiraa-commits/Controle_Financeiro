"use client";

import {
  ArrowDownUp,
  BarChart3,
  BookOpenCheck,
  ContactRound,
  CreditCard,
  Goal,
  HandCoins,
  Import,
  LayoutDashboard,
  ListTodo,
  Menu,
  Repeat,
  Tags,
  WalletCards,
  X
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "../../lib/utils/cn";

const items = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/fluxo-caixa", label: "Fluxo de Caixa", icon: ArrowDownUp },
  { href: "/lancamentos", label: "Lançamentos", icon: ListTodo },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/recebimentos-terceiros", label: "Recebimentos", icon: HandCoins },
  { href: "/recorrencias", label: "Recorrências", icon: Repeat },
  { href: "/parcelamentos", label: "Parcelamentos", icon: CreditCard },
  { href: "/metas", label: "Metas", icon: Goal },
  { href: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/importacoes", label: "Importações", icon: Import },
  { href: "/contas", label: "Contas", icon: BookOpenCheck },
  { href: "/partes", label: "Partes", icon: ContactRound },
  { href: "/categorias", label: "Categorias", icon: Tags }
];

export function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <aside className="w-full md:sticky md:top-5 md:h-[calc(100vh-2.5rem)] md:w-[280px] md:shrink-0">
      <div className="panel flex h-full min-h-0 flex-col overflow-hidden p-3 md:p-4">
        <div className="mb-3 rounded-xl border border-border/70 bg-surface-soft/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-brand-contrast">
                <WalletCards size={18} />
              </div>
              <div>
                <p className="font-[var(--font-title)] text-sm font-semibold tracking-wide text-text">Fluxo BR</p>
                <p className="text-xs text-muted">Controle financeiro pessoal</p>
              </div>
            </div>

            <button
              type="button"
              aria-label={mobileOpen ? "Fechar menu" : "Abrir menu"}
              onClick={() => setMobileOpen((prev) => !prev)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-surface text-muted transition hover:bg-surface-soft md:hidden"
            >
              {mobileOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>

        <div
          className={cn(
            "min-h-0 space-y-2 transition-all md:flex-1",
            mobileOpen ? "block" : "hidden md:block"
          )}
        >
          <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Navegacao</p>
          <nav className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 md:max-h-full md:grid-cols-1 md:overflow-y-auto md:pr-1">
            {items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm font-medium transition",
                    active
                      ? "border-brand/35 bg-brand/15 text-brand shadow-soft"
                      : "border-transparent text-muted hover:border-border/80 hover:bg-surface-soft hover:text-text"
                  )}
                >
                  <Icon size={16} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </aside>
  );
}

