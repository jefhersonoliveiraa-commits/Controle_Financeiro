# Sistema de Controle Financeiro Pessoal (PT-BR)

Aplicacao fullstack para controle financeiro pessoal com foco em:
- fluxo de caixa diario previsto;
- contas a pagar e a receber;
- provisoes e valores variaveis;
- recorrencias e parcelamentos;
- metas financeiras com recalculo automatico;
- importacao CSV com preview + commit;
- painel de saude financeira.

## Stack
- Frontend: Next.js (App Router) + Tailwind + TanStack Query/Table + Recharts + RHF + Zod.
- Backend: NestJS + Prisma + PostgreSQL + JWT (access + refresh token rotativo).
- Contratos tipados compartilhados: `packages/contracts`.

## Banco local (PostgreSQL)
O projeto esta configurado para usar PostgreSQL local por padrao:
- Variavel: `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/financeiro?schema=public"` (em `apps/api/.env`)
- Suba o banco local com:
```bash
docker compose up -d
```

## Como rodar
### Opcao rapida (Windows)
Execute o arquivo de start na raiz do projeto:
```powershell
.\start.ps1
```
Ou:
```bat
start.bat
```

Flags uteis:
- `-Seed`: forca executar seed.
- `-ForceInstall`: forca `npm install`.
- `-NoDev`: prepara ambiente sem iniciar servidor.

### Passo a passo manual
1. Copie variaveis da API:
```bash
cp apps/api/.env.example apps/api/.env
```
2. Instale dependencias:
```bash
npm install
```
3. Gere cliente Prisma e rode migracao:
```bash
npm run prisma:generate
npm run prisma:migrate -- --name init
```
4. Popule dados de exemplo:
```bash
npm run prisma:seed
```
5. Suba frontend + backend:
```bash
npm run dev
```

## Se aparecer "Failed to fetch" no login
Normalmente significa API fora do ar.
1. Confirme que o backend subiu:
```bash
npm run dev:api
```
2. Em outro terminal, suba o frontend:
```bash
npm run dev:web
```
3. Garanta que a porta `3333` esteja livre antes de subir a API.

## Variaveis importantes (API)
- `DATABASE_URL`: conexao PostgreSQL.
- `JWT_SECRET`: segredo do token de acesso.
- `JWT_REFRESH_SECRET`: segredo do refresh token.
- `CORS_ORIGINS`: origens permitidas separadas por virgula (ex.: `http://localhost:3000,https://seu-front.com`).

## Login demo
- E-mail: `demo@financeiro.app`
- Senha: `123456`

## Dados de exemplo inclusos no seed
- Salario recorrente (dia 5)
- Aluguel recorrente (dia 10)
- Internet recorrente (dia 12)
- Energia como provisao variavel (dia 15)
- Compra parcelada em 12x
- Meta de R$20.000 em 10 meses
- Usuario demo admin

## Rotas novas/relevantes
- CRUD completo de contas, categorias, partes, recorrencias e metas (`POST/GET/PATCH/DELETE`)
- `GET /reports/health?startDate&endDate`
- `POST /imports/transactions/preview`
- `POST /imports/transactions/commit`
- `GET /exports/transactions.csv?startDate&endDate`
- `GET /exports/transactions.xlsx?startDate&endDate`

## Documentacao complementar
- `docs/architecture.md`
- `docs/api-routes.md`
- `docs/wireframes.md`
