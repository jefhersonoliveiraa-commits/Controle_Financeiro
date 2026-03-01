# Arquitetura Proposta

## Stack
- Frontend: Next.js (App Router) + TypeScript + Tailwind + TanStack Query + TanStack Table + Recharts + React Hook Form + Zod.
- Backend: NestJS + TypeScript + Prisma + PostgreSQL + JWT (access + refresh rotativo) + RBAC simples.
- Contratos tipados compartilhados: `packages/contracts` (Zod + tipos inferidos).

## Camadas
- `apps/web`: UI, estado de tela, cache cliente, formulários.
- `apps/api/src/modules`: domínio e regras de negócio por contexto.
- `apps/api/src/prisma`: acesso ao banco e modelo relacional.
- `packages/contracts`: contratos de entrada/saída e enums compartilhados.

## Organização de Pastas
```txt
apps/
  api/
    prisma/
      schema.prisma
      seed.ts
    src/
      common/
      config/
      modules/
        auth/
        accounts/
        categories/
        parties/
        transactions/
        recurrences/
        goals/
        cashflow/
        reports/
        exports/
        imports/
      prisma/
  web/
    app/
      login/
      fluxo-caixa/
      lancamentos/
      recorrencias/
      parcelamentos/
      metas/
      relatorios/
      contas/
      categorias/
    components/
      layout/
      ui/
      cashflow/
      transactions/
      shared/
    lib/
      api/
      hooks/
      utils/
packages/
  contracts/
docs/
```

## Fluxos Principais
1. Usuário autentica em `/auth/login` e recebe `accessToken + refreshToken`.
2. Frontend chama APIs tipadas com `Authorization: Bearer`.
3. Módulo de lançamentos aplica regras:
   - parcela automática,
   - efetivação com valor real,
   - histórico de alterações.
4. Módulo de metas cria saídas mensais automáticas (provisionadas/variáveis) e recalcula distribuição futura.
5. Módulo de fluxo de caixa agrega:
   - saldo inicial das contas,
   - lançamentos persistidos,
   - projeções de recorrências não geradas.

## Observabilidade e Erros
- Interceptor HTTP com logs estruturados JSON (`method`, `path`, `status`, `elapsedMs`, `userId`).
- Filtro global de exceções com payload consistente (`statusCode`, `message`, `timestamp`, `path`).
