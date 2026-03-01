# Wireframes (Texto)

## 1) Fluxo de Caixa (Tela principal)
```txt
+---------------------------------------------------------------+
| Sidebar | Filtro periodo | [Data inicial] [Data final]       |
|         |-----------------------------------------------------|
|         | KPI: Entradas | Saidas | Saldo acumulado | Alertas  |
|         |-----------------------------------------------------|
|         | Grafico (Entradas x Saidas x Saldo acumulado)       |
|         |-----------------------------------------------------|
|         | Tabela por dia:                                    |
|         | Data | Entradas | Saidas | Saldo dia | Acumulado    |
|         | [linha clicavel] -> painel de lancamentos do dia    |
+---------------------------------------------------------------+
```

## 2) Lançamentos
```txt
+---------------------------------------------------------------+
| Filtros: status | tipo | descricao                            |
| [ + Novo lancamento ]                                      |
|---------------------------------------------------------------|
| Tabela avançada (TanStack):                                  |
| descricao | tipo | status | vencimento | valor | conta | acoes|
| Acao: Efetivar -> modal: "Manter valor" ou "Alterar valor"   |
+---------------------------------------------------------------+
```

## 3) Metas Financeiras
```txt
+---------------------------------------------------------------+
| Form: nome, alvo, acumulado, data final, conta, categoria     |
|---------------------------------------------------------------|
| Card da meta:                                                 |
| Nome, barra de progresso %, acumulado, restante               |
| Nova media mensal necessaria | meses restantes | Recalcular   |
+---------------------------------------------------------------+
```

## 4) Relatórios
```txt
+---------------------------------------------------------------+
| KPI Previsto x Real | Variacao                               |
| Pie: total por categoria                                     |
| Bar: fixos x variaveis x provisoes                           |
| Blocos: proximos 7/30 dias e metas                           |
+---------------------------------------------------------------+
```
