"use client";

import { MoonStar, Sun } from "lucide-react";
import { cn } from "../../lib/utils/cn";
import { useTheme } from "../../lib/hooks/theme-provider";

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, mounted, toggleTheme } = useTheme();

  if (!mounted) {
    return <div className={cn("h-10 w-10 rounded-lg border border-transparent", className)} />;
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      title={isDark ? "Ativar tema claro" : "Ativar tema escuro"}
      onClick={toggleTheme}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface text-text transition hover:bg-surface-soft",
        className
      )}
    >
      {isDark ? <Sun size={17} /> : <MoonStar size={17} />}
    </button>
  );
}
