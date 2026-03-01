# Rotas da API (REST)

## Auth
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `GET /auth/profile`

## Cadastros
- `GET/POST /accounts`
- `PATCH/DELETE /accounts/:id`
- `GET /accounts/:id`
- `GET/POST /categories`
- `PATCH/DELETE /categories/:id`
- `GET/POST /parties`
- `PATCH/DELETE /parties/:id`

## Lançamentos
- `GET/POST /transactions`
- `PATCH /transactions/:id`
- `PATCH /transactions/:id/effectivate`
- `PATCH /transactions/:id/anticipate`
- `DELETE /transactions/:id`

## Recorrências
- `GET/POST /recurrences`
- `PATCH/DELETE /recurrences/:id`
- `POST /recurrences/generate-monthly?reference=YYYY-MM`

## Metas
- `GET/POST /goals`
- `PATCH/DELETE /goals/:id`
- `PATCH /goals/:id/recalculate`

## Fluxo de Caixa
- `GET /cashflow?startDate&endDate&accountIds`
- `GET /cashflow/day/:date`

## Relatórios e Exportações
- `GET /reports/summary?startDate&endDate`
- `GET /reports/health?startDate&endDate`
- `GET /exports/transactions.csv?startDate&endDate`
- `GET /exports/transactions.xlsx?startDate&endDate`

## Importação
- `POST /imports/transactions/preview`
- `POST /imports/transactions/commit`
