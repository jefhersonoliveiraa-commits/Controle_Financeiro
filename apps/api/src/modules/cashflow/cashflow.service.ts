import { Injectable } from "@nestjs/common";
import { cashflowQuerySchema } from "@financeiro/contracts";
import { isSameDay } from "date-fns";
import { listDays, normalizedInterval } from "../../common/date.js";
import { decimalToNumber } from "../../common/number.js";
import { validateWithZod } from "../../common/zod.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { RecurrencesService } from "../recurrences/recurrences.service.js";

type TransactionRow = {
  id: string;
  type: "INCOME" | "EXPENSE";
  status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
  description: string;
  behavior: "FIXED" | "VARIABLE" | "PROVISION";
  dueDate: Date;
  amountPlanned: number;
  amountActual: number | null;
  category: { id: string; name: string; color: string };
  account: { id: string; name: string; type: "BANK_ACCOUNT" | "CASH" | "CREDIT_CARD" };
  isProjected?: boolean;
};

@Injectable()
export class CashflowService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recurrencesService: RecurrencesService
  ) {}

  async getDailyForecast(userId: string, query: unknown) {
    const normalizedPayload = this.normalizeQuery(query);
    const parsed = validateWithZod(cashflowQuerySchema, normalizedPayload);
    const { startDate, endDate } = normalizedInterval(
      new Date(parsed.startDate),
      new Date(parsed.endDate)
    );

    const accounts = await this.prisma.account.findMany({
      where: {
        userId,
        type: { in: ["BANK_ACCOUNT", "CASH"] },
        id: parsed.accountIds?.length ? { in: parsed.accountIds } : undefined
      }
    });
    const accountIds = accounts.map((item) => item.id);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        accountId: { in: accountIds },
        account: { type: { in: ["BANK_ACCOUNT", "CASH"] } },
        dueDate: { lte: endDate },
        ...(parsed.includeCanceled ? {} : { status: { not: "CANCELED" } })
      },
      include: { category: true, account: true },
      orderBy: { dueDate: "asc" }
    });

    const projectedRecurrences = (
      await this.recurrencesService.projectedForRange(userId, startDate, endDate)
    ).filter((row) => row.account.type === "BANK_ACCOUNT" || row.account.type === "CASH");
    const initialBalanceRows: TransactionRow[] = accounts
      .filter((account) => account.initialBalanceDate > startDate && account.initialBalanceDate <= endDate)
      .map((account) => ({
        id: `opening-${account.id}-${account.initialBalanceDate.toISOString().slice(0, 10)}`,
        type: "INCOME",
        status: "RECEIVED",
        description: `Saldo inicial da conta ${account.name}`,
        behavior: "FIXED",
        dueDate: account.initialBalanceDate,
        amountPlanned: decimalToNumber(account.initialBalance),
        amountActual: decimalToNumber(account.initialBalance),
        category: {
          id: "opening-balance",
          name: "Saldo inicial",
          color: "#0ea5e9"
        },
        account: {
          id: account.id,
          name: account.name,
          type: account.type
        },
        isProjected: false
      }));

    const allRows: TransactionRow[] = [
      ...initialBalanceRows,
      ...transactions.map((row) => ({
        id: row.id,
        type: row.type,
        status: row.status,
        description: row.description,
        behavior: row.behavior,
        dueDate: row.dueDate,
        amountPlanned: decimalToNumber(row.amountPlanned),
        amountActual: row.amountActual ? decimalToNumber(row.amountActual) : null,
        category: {
          id: row.category.id,
          name: row.category.name,
          color: row.category.color
        },
        account: {
          id: row.account.id,
          name: row.account.name,
          type: row.account.type
        },
        isProjected: row.isProjected
      })),
      ...projectedRecurrences
    ];

    const openingBalance = this.calculateOpeningBalance(accounts, allRows, startDate);
    const totalLimit = accounts.reduce((sum, item) => sum + decimalToNumber(item.creditLimit), 0);

    let cumulative = openingBalance;
    const rows = listDays(startDate, endDate).map((day) => {
      const dayRows = allRows.filter((item) => isSameDay(item.dueDate, day));
      const incomes = this.sumByType(dayRows, "INCOME");
      const expenses = this.sumByType(dayRows, "EXPENSE");
      const dayBalance = Number((incomes - expenses).toFixed(2));
      cumulative = Number((cumulative + dayBalance).toFixed(2));
      const alert =
        cumulative < 0 ? "NEGATIVE" : totalLimit > 0 && cumulative <= totalLimit * 0.1 ? "LIMIT" : "OK";

      return {
        date: day.toISOString().slice(0, 10),
        incomes: Number(incomes.toFixed(2)),
        expenses: Number(expenses.toFixed(2)),
        dayBalance,
        cumulativeBalance: cumulative,
        alert
      };
    });

    return {
      range: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      openingBalance: Number(openingBalance.toFixed(2)),
      totalLimit: Number(totalLimit.toFixed(2)),
      rows
    };
  }

  async getDayTransactions(userId: string, date: string, accountIds?: string[]) {
    const targetDate = new Date(`${date}T12:00:00.000Z`);
    const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
    const end = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        dueDate: { gte: start, lte: end },
        status: { not: "CANCELED" },
        accountId: accountIds?.length ? { in: accountIds } : undefined,
        account: { type: { in: ["BANK_ACCOUNT", "CASH"] } }
      },
      include: { category: true, account: true },
      orderBy: { createdAt: "desc" }
    });

    const projected = (await this.recurrencesService.projectedForRange(userId, start, end)).filter(
      (row) => row.account.type === "BANK_ACCOUNT" || row.account.type === "CASH"
    );
    return [...transactions.map((row) => this.mapTransaction(row)), ...projected];
  }

  private normalizeQuery(query: unknown) {
    const raw = (query as Record<string, unknown>) ?? {};
    const rawAccountIds = raw.accountIds;
    const accountIds =
      typeof rawAccountIds === "string"
        ? rawAccountIds.split(",").filter(Boolean)
        : Array.isArray(rawAccountIds)
          ? (rawAccountIds.filter((item) => typeof item === "string") as string[])
          : undefined;

    return {
      startDate: raw.startDate,
      endDate: raw.endDate,
      includeCanceled: raw.includeCanceled === "true" || raw.includeCanceled === true,
      accountIds
    };
  }

  private calculateOpeningBalance(
    accounts: Array<{ initialBalance: { toString(): string }; initialBalanceDate: Date; creditLimit: { toString(): string } | null }>,
    transactions: TransactionRow[],
    startDate: Date
  ): number {
    const initialFromAccounts = accounts
      .filter((item) => item.initialBalanceDate <= startDate)
      .reduce((sum, item) => sum + decimalToNumber(item.initialBalance), 0);

    const priorTransactions = transactions
      .filter((item) => item.dueDate < startDate && item.status !== "CANCELED")
      .reduce((sum, item) => {
        const signed = item.type === "INCOME" ? 1 : -1;
        return sum + signed * this.resolveAmount(item);
      }, 0);

    return Number((initialFromAccounts + priorTransactions).toFixed(2));
  }

  private sumByType(rows: TransactionRow[], type: "INCOME" | "EXPENSE"): number {
    return rows
      .filter((item) => item.type === type)
      .reduce((sum, item) => sum + this.resolveAmount(item), 0);
  }

  private resolveAmount(row: { status: string; amountActual: number | null; amountPlanned: number }): number {
    if ((row.status === "PAID" || row.status === "RECEIVED") && row.amountActual !== null) {
      return row.amountActual;
    }
    return row.amountPlanned;
  }

  private mapTransaction(row: {
    id: string;
    description: string;
    type: "INCOME" | "EXPENSE";
    status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
    behavior: "FIXED" | "VARIABLE" | "PROVISION";
    dueDate: Date;
    amountPlanned: { toString(): string };
    amountActual: { toString(): string } | null;
    category: { id: string; name: string; color: string };
    account: { id: string; name: string; type: "BANK_ACCOUNT" | "CASH" | "CREDIT_CARD" };
  }): TransactionRow {
    return {
      id: row.id,
      description: row.description,
      type: row.type,
      status: row.status,
      behavior: row.behavior,
      dueDate: row.dueDate,
      amountPlanned: decimalToNumber(row.amountPlanned),
      amountActual: row.amountActual ? decimalToNumber(row.amountActual) : null,
      category: row.category,
      account: row.account
    };
  }
}
