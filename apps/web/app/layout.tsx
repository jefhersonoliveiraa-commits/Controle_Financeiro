import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { AppShell } from "./app-shell";

const THEME_INIT_SCRIPT = `
  (() => {
    try {
      const storageKey = "financeiro-theme";
      const root = document.documentElement;
      const stored = localStorage.getItem(storageKey);
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      const theme = stored === "dark" || stored === "light" ? stored : systemTheme;
      root.classList.toggle("dark", theme === "dark");
      root.dataset.theme = theme;
    } catch (_) {}
  })();
`;

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap"
});

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-title",
  display: "swap"
});

export const metadata: Metadata = {
  title: "Fluxo BR - Controle Financeiro Pessoal",
  description: "Web app para fluxo de caixa diario, metas e planejamento financeiro."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${manrope.variable} ${sora.variable} min-h-screen font-[var(--font-body)]`}>
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
