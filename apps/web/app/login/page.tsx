"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ThemeToggle } from "../../components/layout/theme-toggle";
import { Button } from "../../components/ui/button";
import { CardDescription, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { useAuth } from "../../lib/hooks/auth-provider";

const loginSchema = z.object({
  email: z.string().email("Informe um e-mail valido."),
  password: z.string().min(6, "Minimo de 6 caracteres.")
});

const registerSchema = loginSchema.extend({
  name: z.string().min(2, "Informe seu nome.")
});

type LoginFormValues = z.infer<typeof loginSchema>;
type RegisterFormValues = z.infer<typeof registerSchema>;
type AuthFormValues = {
  name?: string;
  email: string;
  password: string;
};

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const { login, register } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const schema = useMemo(() => (mode === "login" ? loginSchema : registerSchema), [mode]);

  const form = useForm<AuthFormValues>({
    resolver: zodResolver(schema as z.ZodType<AuthFormValues>),
    defaultValues: {
      email: "demo@financeiro.app",
      password: "123456",
      ...(mode === "register" ? { name: "" } : {})
    }
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      if (mode === "login") {
        await login(values as LoginFormValues);
      } else {
        await register(values as RegisterFormValues);
      }
      router.push("/fluxo-caixa");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Falha ao autenticar.");
    }
  });

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-4">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-[-18%] top-[-15%] h-[420px] w-[420px] rounded-full bg-brand/20 blur-[90px]" />
        <div className="absolute bottom-[-22%] right-[-12%] h-[380px] w-[380px] rounded-full bg-brand/15 blur-[95px]" />
      </div>

      <ThemeToggle className="absolute right-4 top-4 z-10" />

      <div className="relative z-[1] grid w-full max-w-4xl gap-4 rounded-[1.5rem] border border-border/70 bg-surface/85 p-4 shadow-panel backdrop-blur-xl md:grid-cols-[1.15fr_1fr] md:p-6">
        <div className="hidden rounded-2xl border border-border/70 bg-surface-soft/70 p-6 md:flex md:flex-col md:justify-between">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-brand-contrast">
            <Sparkles size={20} />
          </div>
          <div className="space-y-2">
            <h2 className="font-[var(--font-title)] text-2xl font-semibold">Fluxo BR</h2>
            <p className="text-sm text-muted">
              Controle financeiro com visual moderno, foco em clareza e acompanhamento diario.
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-surface px-4 py-3 text-sm text-muted">
            <div className="mb-1 flex items-center gap-2 text-text">
              <ShieldCheck size={15} />
              Sessao segura
            </div>
            JWT + refresh token ativo para autenticacao.
          </div>
        </div>

        <div className="panel p-6">
          <CardTitle>{mode === "login" ? "Entrar no Fluxo BR" : "Criar conta"}</CardTitle>
          <CardDescription className="mt-1">
            {mode === "login" ? "Use o usuario demo para teste rapido." : "Cadastro com autenticacao segura."}
          </CardDescription>

          <form className="mt-4 space-y-3" onSubmit={onSubmit}>
            {mode === "register" ? (
              <div className="space-y-1">
                <label className="text-sm">Nome</label>
                <Input {...form.register("name")} />
                <p className="text-xs text-danger">{form.formState.errors.name?.message}</p>
              </div>
            ) : null}

            <div className="space-y-1">
              <label className="text-sm">E-mail</label>
              <Input type="email" {...form.register("email")} />
              <p className="text-xs text-danger">{form.formState.errors.email?.message}</p>
            </div>

            <div className="space-y-1">
              <label className="text-sm">Senha</label>
              <Input type="password" {...form.register("password")} />
              <p className="text-xs text-danger">{form.formState.errors.password?.message}</p>
            </div>

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Entrando..." : mode === "login" ? "Entrar" : "Cadastrar"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-4 text-sm text-brand"
            disabled={form.formState.isSubmitting}
            onClick={() => {
              const nextMode = mode === "login" ? "register" : "login";
              setMode(nextMode);
              form.reset({ email: "", password: "", ...(nextMode === "register" ? { name: "" } : {}) });
            }}
          >
            {mode === "login" ? "Nao tem conta? Cadastre-se" : "Ja tem conta? Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
