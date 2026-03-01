import { Injectable } from "@nestjs/common";
import { healthReportQuerySchema, reportRangeQuerySchema } from "@financeiro/contracts";
import {
  addDays,
  differenceInCalendarMonths,
  endOfDay,
  endOfMonth,
  format,
  startOfDay,
  startOfMonth,
  subMonths
} from "date-fns";
import { Prisma } from "@prisma/client";
import { decimalToNumber } from "../../common/number.js";
import { validateWithZod } from "../../common/zod.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { GoalsService } from "../goals/goals.service.js";
import { RecurrencesService } from "../recurrences/recurrences.service.js";

type CategoryAccumulator = { category: string; color: string; total: number };

type SummaryRow = {
  id: string;
  type: "INCOME" | "EXPENSE";
  status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
  behavior: "FIXED" | "VARIABLE" | "PROVISION";
  dueDate: Date;
  amountPlanned: number;
  amountActual: number | null;
  categoryId: string;
  category: { name: string; color: string };
  isProjected?: boolean;
};

type HealthRow = {
  type: "INCOME" | "EXPENSE";
  status: "PENDING" | "PAID" | "RECEIVED" | "CANCELED";
  behavior: "FIXED" | "VARIABLE" | "PROVISION";
  dueDate: Date;
  amountPlanned: number;
  amountActual: number | null;
  isProjected?: boolean;
};

type CardAllocationExpenseRow = {
  id: string;
  paidAt: Date;
  amount: number;
  behavior: "FIXED" | "VARIABLE" | "PROVISION";
  categoryId: string;
  category: { name: string; color: string };
};

type CardPaymentContext = {
  transferGroupIds: string[];
  allocations: CardAllocationExpenseRow[];
};

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly goalsService: GoalsService,
    private readonly recurrencesService: RecurrencesService
  ) {}

  async summary(userId: string, query: unknown) {
    const parsed = validateWithZod(reportRangeQuerySchema, query);
    const startDate = new Date(parsed.startDate);
    const endDate = new Date(parsed.endDate);
    const cardContext = await this.loadCardPaymentContext(userId, startDate, endDate);

    const rangeRows = await this.prisma.transaction.findMany({
      where: {
        userId,
        dueDate: { gte: startDate, lte: endDate },
        status: { not: "CANCELED" },
        account: { type: { not: "CREDIT_CARD" } },
        ...this.buildTransferGroupFilter(cardContext.transferGroupIds)
      },
      include: {
        category: true
      }
    });

    const projectedRows = (await this.recurrencesService.projectedForRange(userId, startDate, endDate)).filter(
      (row) => row.account.type !== "CREDIT_CARD"
    );
    const allRows: SummaryRow[] = [
      ...rangeRows.map((row) => ({
        id: row.id,
        type: row.type,
        status: row.status,
        behavior: row.behavior,
        dueDate: row.dueDate,
        amountPlanned: decimalToNumber(row.amountPlanned),
        amountActual: row.amountActual ? decimalToNumber(row.amountActual) : null,
        categoryId: row.categoryId,
        category: {
          name: row.category.name,
          color: row.category.color
        },
        isProjected: row.isProjected
      })),
      ...projectedRows.map((row) => ({
        id: row.id,
        type: row.type,
        status: row.status,
        behavior: row.behavior,
        dueDate: row.dueDate,
        amountPlanned: row.amountPlanned,
        amountActual: row.amountActual,
        categoryId: row.category.id,
        category: {
          name: row.category.name,
          color: row.category.color
        },
        isProjected: true
      })),
      ...cardContext.allocations.map((row) => ({
        id: row.id,
        type: "EXPENSE" as const,
        status: "PAID" as const,
        behavior: row.behavior,
        dueDate: row.paidAt,
        amountPlanned: row.amount,
        amountActual: row.amount,
        categoryId: row.categoryId,
        category: {
          name: row.category.name,
          color: row.category.color
        },
        isProjected: false
      }))
    ];

    const expenseCategoryMap = new Map<string, CategoryAccumulator>();
    const incomeCategoryMap = new Map<string, CategoryAccumulator>();
    let plannedIncome = 0;
    let plannedExpense = 0;
    let realIncome = 0;
    let realExpense = 0;
    let fixedTotal = 0;
    let variableTotal = 0;
    let provisionTotal = 0;

    for (const row of allRows) {
      const planned = row.amountPlanned;
      const isSettled = !row.isProjected && (row.status === "PAID" || row.status === "RECEIVED");
      const real = isSettled ? (row.amountActual ?? planned) : 0;

      if (row.type === "INCOME") {
        plannedIncome += planned;
        realIncome += real;
        this.sumCategory(incomeCategoryMap, row.categoryId, row.category.name, row.category.color, planned);
      } else {
        plannedExpense += planned;
        realExpense += real;
        this.sumCategory(expenseCategoryMap, row.categoryId, row.category.name, row.category.color, planned);

        if (row.behavior === "FIXED") fixedTotal += planned;
        if (row.behavior === "VARIABLE") variableTotal += planned;
        if (row.behavior === "PROVISION") provisionTotal += planned;
      }
    }

    const monthlyEvolution = await this.monthlyEvolution(userId);
    const monthComparison = this.monthComparison(monthlyEvolution);
    const upcoming7 = await this.listUpcoming(userId, 7);
    const upcoming30 = await this.listUpcoming(userId, 30);

    const plannedBalance = plannedIncome - plannedExpense;
    const realBalance = realIncome - realExpense;

    return {
      period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      byCategoryExpenses: this.sortCategories(expenseCategoryMap),
      byCategoryIncomes: this.sortCategories(incomeCategoryMap),
      byCategory: this.sortCategories(expenseCategoryMap),
      plannedVsReal: {
        planned: Number(plannedBalance.toFixed(2)),
        real: Number(realBalance.toFixed(2)),
        variance: Number((realBalance - plannedBalance).toFixed(2))
      },
      rangeTotals: {
        plannedIncome: Number(plannedIncome.toFixed(2)),
        plannedExpense: Number(plannedExpense.toFixed(2)),
        plannedBalance: Number(plannedBalance.toFixed(2)),
        realIncome: Number(realIncome.toFixed(2)),
        realExpense: Number(realExpense.toFixed(2)),
        realBalance: Number(realBalance.toFixed(2))
      },
      behaviorSplit: {
        fixed: Number(fixedTotal.toFixed(2)),
        variable: Number(variableTotal.toFixed(2)),
        provision: Number(provisionTotal.toFixed(2))
      },
      monthComparison,
      monthlyEvolution,
      upcoming7,
      upcoming30,
      goals: await this.goalsService.list(userId)
    };
  }

  async health(userId: string, query: unknown) {
    const parsed = validateWithZod(healthReportQuerySchema, query);
    const startDate = startOfDay(new Date(parsed.startDate));
    const endDate = endOfDay(new Date(parsed.endDate));
    const cardContext = await this.loadCardPaymentContext(userId, startDate, endDate);

    const transactions = await this.prisma.transaction.findMany({
      where: {
        userId,
        dueDate: { gte: startDate, lte: endDate },
        status: { not: "CANCELED" },
        account: { type: { not: "CREDIT_CARD" } },
        ...this.buildTransferGroupFilter(cardContext.transferGroupIds)
      },
      select: {
        type: true,
        status: true,
        behavior: true,
        dueDate: true,
        amountPlanned: true,
        amountActual: true,
        isProjected: true
      }
    });

    const projectedRows = (await this.recurrencesService.projectedForRange(userId, startDate, endDate)).filter(
      (row) => row.account.type !== "CREDIT_CARD"
    );
    const rows: HealthRow[] = [
      ...transactions.map((item) => ({
        type: item.type,
        status: item.status,
        behavior: item.behavior,
        dueDate: item.dueDate,
        amountPlanned: decimalToNumber(item.amountPlanned),
        amountActual: item.amountActual ? decimalToNumber(item.amountActual) : null,
        isProjected: item.isProjected
      })),
      ...projectedRows.map((item) => ({
        type: item.type,
        status: item.status,
        behavior: item.behavior,
        dueDate: item.dueDate,
        amountPlanned: item.amountPlanned,
        amountActual: item.amountActual,
        isProjected: true
      })),
      ...cardContext.allocations.map((row) => ({
        type: "EXPENSE" as const,
        status: "PAID" as const,
        behavior: row.behavior,
        dueDate: row.paidAt,
        amountPlanned: row.amount,
        amountActual: row.amount,
        isProjected: false
      }))
    ];

    const metrics = this.calculateHealthMetrics(rows);

    const accounts = await this.prisma.account.findMany({
      where: { userId }
    });

    const ledgerRows = await this.prisma.transaction.findMany({
      where: {
        userId,
        dueDate: { lte: endDate },
        status: { not: "CANCELED" },
        account: { type: { not: "CREDIT_CARD" } }
      },
      select: {
        type: true,
        status: true,
        amountPlanned: true,
        amountActual: true
      }
    });

    const initialBalance = accounts
      .filter((item) => item.initialBalanceDate <= endDate)
      .reduce((sum, item) => sum + decimalToNumber(item.initialBalance), 0);
    const movementBalance = ledgerRows.reduce((sum, item) => {
      const value =
        (item.status === "PAID" || item.status === "RECEIVED") && item.amountActual
          ? decimalToNumber(item.amountActual)
          : decimalToNumber(item.amountPlanned);
      return sum + (item.type === "INCOME" ? value : -value);
    }, 0);
    const closingBalance = Number((initialBalance + movementBalance).toFixed(2));

    const monthCount = Math.max(
      differenceInCalendarMonths(startOfMonth(endDate), startOfMonth(startDate)) + 1,
      1
    );
    const averageMonthlyExpense = metrics.totalExpense / monthCount;
    const cashCoverageMonths =
      averageMonthlyExpense > 0
        ? Number((closingBalance / averageMonthlyExpense).toFixed(2))
        : 0;

    const score = this.calculateHealthScore({
      savingsRate: metrics.savingsRate,
      commitmentRate: metrics.commitmentRate,
      fixedExpenseRate: metrics.fixedExpenseRate,
      pendingRate: metrics.pendingRate,
      cashCoverageMonths
    });

    const alerts = this.buildHealthAlerts({
      savingsRate: metrics.savingsRate,
      commitmentRate: metrics.commitmentRate,
      pendingRate: metrics.pendingRate,
      cashCoverageMonths
    });

    const trends = await this.buildHealthTrends(userId, endDate);

    return {
      period: { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
      kpis: {
        savingsRate: metrics.savingsRate,
        commitmentRate: metrics.commitmentRate,
        cashCoverageMonths,
        fixedExpenseRate: metrics.fixedExpenseRate,
        pendingRate: metrics.pendingRate,
        totalIncome: metrics.totalIncome,
        totalExpense: metrics.totalExpense,
        totalPending: metrics.totalPending
      },
      score,
      alerts,
      trends
    };
  }

  private async monthlyEvolution(userId: string) {
    const monthStart = startOfMonth(subMonths(new Date(), 11));
    const monthEnd = endOfMonth(new Date());
    const cardContext = await this.loadCardPaymentContext(userId, monthStart, monthEnd);

    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        dueDate: { gte: monthStart, lte: monthEnd },
        status: { not: "CANCELED" },
        account: { type: { not: "CREDIT_CARD" } },
        ...this.buildTransferGroupFilter(cardContext.transferGroupIds)
      },
      select: {
        type: true,
        status: true,
        amountPlanned: true,
        amountActual: true,
        dueDate: true
      }
    });

    const projectedRows = (await this.recurrencesService.projectedForRange(userId, monthStart, monthEnd)).filter(
      (row) => row.account.type !== "CREDIT_CARD"
    );

    const months = Array.from({ length: 12 }, (_, index) => {
      const reference = startOfMonth(subMonths(new Date(), 11 - index));
      return {
        key: format(reference, "yyyy-MM"),
        month: format(reference, "MM/yyyy"),
        income: 0,
        expense: 0,
        balance: 0,
        realIncome: 0,
        realExpense: 0,
        realBalance: 0
      };
    });
    const monthMap = new Map(months.map((item) => [item.key, item]));

    for (const row of rows) {
      const key = format(startOfMonth(row.dueDate), "yyyy-MM");
      const target = monthMap.get(key);
      if (!target) continue;

      const planned = decimalToNumber(row.amountPlanned);
      const isSettled = row.status === "PAID" || row.status === "RECEIVED";
      const real = isSettled ? (row.amountActual ? decimalToNumber(row.amountActual) : planned) : 0;

      if (row.type === "INCOME") {
        target.income += planned;
        target.realIncome += real;
      } else {
        target.expense += planned;
        target.realExpense += real;
      }
    }

    for (const row of projectedRows) {
      const key = format(startOfMonth(row.dueDate), "yyyy-MM");
      const target = monthMap.get(key);
      if (!target) continue;
      if (row.type === "INCOME") {
        target.income += row.amountPlanned;
      } else {
        target.expense += row.amountPlanned;
      }
    }

    for (const row of cardContext.allocations) {
      const key = format(startOfMonth(row.paidAt), "yyyy-MM");
      const target = monthMap.get(key);
      if (!target) continue;
      target.expense += row.amount;
      target.realExpense += row.amount;
    }

    return months.map((item) => {
      const balance = item.income - item.expense;
      const realBalance = item.realIncome - item.realExpense;
      return {
        ...item,
        income: Number(item.income.toFixed(2)),
        expense: Number(item.expense.toFixed(2)),
        balance: Number(balance.toFixed(2)),
        realIncome: Number(item.realIncome.toFixed(2)),
        realExpense: Number(item.realExpense.toFixed(2)),
        realBalance: Number(realBalance.toFixed(2))
      };
    });
  }

  private monthComparison(
    monthlyEvolution: Array<{
      key: string;
      month: string;
      income: number;
      expense: number;
      balance: number;
      realIncome: number;
      realExpense: number;
      realBalance: number;
    }>
  ) {
    const currentKey = format(startOfMonth(new Date()), "yyyy-MM");
    const previousKey = format(startOfMonth(subMonths(new Date(), 1)), "yyyy-MM");
    const emptyMonth = {
      key: "",
      month: "",
      income: 0,
      expense: 0,
      balance: 0,
      realIncome: 0,
      realExpense: 0,
      realBalance: 0
    };

    const current = monthlyEvolution.find((item) => item.key === currentKey) ?? emptyMonth;
    const previous = monthlyEvolution.find((item) => item.key === previousKey) ?? emptyMonth;

    return {
      current,
      previous,
      deltas: {
        income: Number((current.income - previous.income).toFixed(2)),
        expense: Number((current.expense - previous.expense).toFixed(2)),
        balance: Number((current.balance - previous.balance).toFixed(2)),
        realBalance: Number((current.realBalance - previous.realBalance).toFixed(2))
      }
    };
  }

  private sortCategories(map: Map<string, CategoryAccumulator>) {
    return Array.from(map.values())
      .map((item) => ({
        ...item,
        total: Number(item.total.toFixed(2))
      }))
      .sort((left, right) => right.total - left.total);
  }

  private sumCategory(
    map: Map<string, CategoryAccumulator>,
    categoryId: string,
    categoryName: string,
    categoryColor: string,
    value: number
  ) {
    const existing = map.get(categoryId) ?? {
      category: categoryName,
      color: categoryColor,
      total: 0
    };
    existing.total += value;
    map.set(categoryId, existing);
  }

  private buildTransferGroupFilter(transferGroupIds: string[]): Prisma.TransactionWhereInput {
    if (!transferGroupIds.length) {
      return {};
    }

    return {
      OR: [{ transferGroupId: null }, { transferGroupId: { notIn: transferGroupIds } }]
    };
  }

  private async loadCardPaymentContext(
    userId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CardPaymentContext> {
    const payments = await this.prisma.cardInvoicePayment.findMany({
      where: {
        userId,
        paidAt: { gte: startDate, lte: endDate }
      },
      select: {
        id: true,
        transferGroupId: true
      }
    });

    const transferGroupIds = Array.from(
      new Set(
        payments
          .map((item) => item.transferGroupId)
          .filter((item): item is string => typeof item === "string" && item.length > 0)
      )
    );

    if (!payments.length) {
      return { transferGroupIds, allocations: [] };
    }

    const allocations = await this.prisma.cardInvoicePaymentAllocation.findMany({
      where: {
        paymentId: { in: payments.map((item) => item.id) }
      },
      include: {
        payment: {
          select: {
            paidAt: true
          }
        },
        transaction: {
          select: {
            id: true,
            status: true,
            behavior: true,
            categoryId: true,
            category: {
              select: {
                name: true,
                color: true
              }
            }
          }
        }
      }
    });

    return {
      transferGroupIds,
      allocations: allocations
        .filter((item) => item.transaction.status !== "CANCELED")
        .map((item) => ({
          id: item.id,
          paidAt: item.payment.paidAt,
          amount: decimalToNumber(item.amountAllocated),
          behavior: item.transaction.behavior,
          categoryId: item.transaction.categoryId,
          category: {
            name: item.transaction.category.name,
            color: item.transaction.category.color
          }
        }))
    };
  }

  private async listUpcoming(userId: string, days: number) {
    const today = startOfDay(new Date());
    const endDate = endOfDay(addDays(today, days));

    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        dueDate: { gte: today, lte: endDate },
        status: "PENDING",
        account: { type: { not: "CREDIT_CARD" } }
      },
      orderBy: { dueDate: "asc" }
    });

    const projectedRows = (await this.recurrencesService.projectedForRange(userId, today, endDate)).filter(
      (row) => row.account.type !== "CREDIT_CARD"
    );
    const invoices = await this.prisma.cardInvoice.findMany({
      where: {
        userId,
        dueDate: { gte: today, lte: endDate },
        status: { in: ["OPEN", "PARTIALLY_PAID"] }
      },
      include: {
        account: {
          select: { id: true, name: true }
        }
      },
      orderBy: { dueDate: "asc" }
    });

    return [
      ...rows.map((row) => ({
        id: row.id,
        dueDate: row.dueDate.toISOString(),
        description: row.description,
        type: row.type,
        amountPlanned: decimalToNumber(row.amountPlanned)
      })),
      ...projectedRows.map((row) => ({
        id: row.id,
        dueDate: row.dueDate.toISOString(),
        description: row.description,
        type: row.type,
        amountPlanned: row.amountPlanned
      })),
      ...invoices
        .map((invoice) => {
          const outstanding = Number(
            (decimalToNumber(invoice.totalAmount) - decimalToNumber(invoice.paidAmount)).toFixed(2)
          );
          return {
            id: `invoice-${invoice.id}`,
            dueDate: invoice.dueDate.toISOString(),
            description: `Fatura ${invoice.account.name} ${invoice.reference}`,
            type: "EXPENSE",
            amountPlanned: outstanding
          };
        })
        .filter((row) => row.amountPlanned > 0.009)
        .map((row) => ({
          ...row,
          amountPlanned: Number(row.amountPlanned.toFixed(2))
        }))
      
    ]
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate))
      .slice(0, 100);
  }

  private calculateHealthMetrics(rows: HealthRow[]) {
    let totalIncome = 0;
    let totalExpense = 0;
    let fixedExpense = 0;
    let totalPending = 0;

    for (const row of rows) {
      const resolved =
        !row.isProjected && (row.status === "PAID" || row.status === "RECEIVED") && row.amountActual !== null
          ? row.amountActual
          : row.amountPlanned;

      if (row.type === "INCOME") {
        totalIncome += resolved;
      } else {
        totalExpense += resolved;
        if (row.behavior === "FIXED") {
          fixedExpense += resolved;
        }
        if (row.status === "PENDING" || row.isProjected) {
          totalPending += resolved;
        }
      }
    }

    const savingsRate =
      totalIncome > 0
        ? Number((((totalIncome - totalExpense) / totalIncome) * 100).toFixed(2))
        : 0;
    const commitmentRate =
      totalIncome > 0 ? Number(((totalExpense / totalIncome) * 100).toFixed(2)) : 0;
    const fixedExpenseRate =
      totalExpense > 0 ? Number(((fixedExpense / totalExpense) * 100).toFixed(2)) : 0;
    const pendingRate =
      totalExpense > 0 ? Number(((totalPending / totalExpense) * 100).toFixed(2)) : 0;

    return {
      totalIncome: Number(totalIncome.toFixed(2)),
      totalExpense: Number(totalExpense.toFixed(2)),
      totalPending: Number(totalPending.toFixed(2)),
      savingsRate,
      commitmentRate,
      fixedExpenseRate,
      pendingRate
    };
  }

  private calculateHealthScore(input: {
    savingsRate: number;
    commitmentRate: number;
    fixedExpenseRate: number;
    pendingRate: number;
    cashCoverageMonths: number;
  }) {
    let score = 100;
    score -= Math.min(input.commitmentRate * 0.35, 35);

    if (input.savingsRate < 0) {
      score -= Math.min(Math.abs(input.savingsRate) * 1.2, 30);
    } else {
      score += Math.min(input.savingsRate * 0.3, 10);
    }

    if (input.fixedExpenseRate > 70) {
      score -= Math.min((input.fixedExpenseRate - 70) * 0.5, 15);
    }
    if (input.pendingRate > 10) {
      score -= Math.min((input.pendingRate - 10) * 0.8, 20);
    }
    if (input.cashCoverageMonths < 1) {
      score -= 20;
    } else if (input.cashCoverageMonths < 3) {
      score -= 10;
    } else if (input.cashCoverageMonths >= 6) {
      score += 6;
    }

    const value = Math.max(0, Math.min(100, Number(score.toFixed(2))));
    const level =
      value < 40
        ? "CRITICAL"
        : value < 60
          ? "ATTENTION"
          : value < 80
            ? "STABLE"
            : "HEALTHY";

    return { value, level };
  }

  private buildHealthAlerts(input: {
    savingsRate: number;
    commitmentRate: number;
    pendingRate: number;
    cashCoverageMonths: number;
  }) {
    const alerts: string[] = [];
    if (input.savingsRate < 0) {
      alerts.push("A taxa de poupanca esta negativa no periodo.");
    }
    if (input.commitmentRate > 85) {
      alerts.push("Comprometimento de renda acima de 85%.");
    }
    if (input.pendingRate > 25) {
      alerts.push("Alto volume de despesas pendentes/projetadas.");
    }
    if (input.cashCoverageMonths < 1) {
      alerts.push("Cobertura de caixa menor que 1 mes.");
    } else if (input.cashCoverageMonths < 3) {
      alerts.push("Cobertura de caixa abaixo de 3 meses.");
    }

    if (alerts.length === 0) {
      alerts.push("Indicadores estaveis no periodo.");
    }
    return alerts;
  }

  private async buildHealthTrends(userId: string, referenceDate: Date) {
    const start = startOfMonth(subMonths(referenceDate, 11));
    const end = endOfMonth(referenceDate);
    const cardContext = await this.loadCardPaymentContext(userId, start, end);

    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        dueDate: { gte: start, lte: end },
        status: { not: "CANCELED" },
        account: { type: { not: "CREDIT_CARD" } },
        ...this.buildTransferGroupFilter(cardContext.transferGroupIds)
      },
      select: {
        type: true,
        status: true,
        behavior: true,
        dueDate: true,
        amountPlanned: true,
        amountActual: true,
        isProjected: true
      }
    });

    const projectedRows = (await this.recurrencesService.projectedForRange(userId, start, end)).filter(
      (row) => row.account.type !== "CREDIT_CARD"
    );

    const byMonth = new Map<string, HealthRow[]>();
    const pushRow = (key: string, row: HealthRow) => {
      const current = byMonth.get(key) ?? [];
      current.push(row);
      byMonth.set(key, current);
    };

    rows.forEach((item) => {
      const key = format(startOfMonth(item.dueDate), "yyyy-MM");
      pushRow(key, {
        type: item.type,
        status: item.status,
        behavior: item.behavior,
        dueDate: item.dueDate,
        amountPlanned: decimalToNumber(item.amountPlanned),
        amountActual: item.amountActual ? decimalToNumber(item.amountActual) : null,
        isProjected: item.isProjected
      });
    });
    projectedRows.forEach((item) => {
      const key = format(startOfMonth(item.dueDate), "yyyy-MM");
      pushRow(key, {
        type: item.type,
        status: item.status,
        behavior: item.behavior,
        dueDate: item.dueDate,
        amountPlanned: item.amountPlanned,
        amountActual: item.amountActual,
        isProjected: true
      });
    });
    cardContext.allocations.forEach((item) => {
      const key = format(startOfMonth(item.paidAt), "yyyy-MM");
      pushRow(key, {
        type: "EXPENSE",
        status: "PAID",
        behavior: item.behavior,
        dueDate: item.paidAt,
        amountPlanned: item.amount,
        amountActual: item.amount,
        isProjected: false
      });
    });

    return Array.from({ length: 12 }, (_, index) => {
      const monthRef = startOfMonth(subMonths(referenceDate, 11 - index));
      const key = format(monthRef, "yyyy-MM");
      const metrics = this.calculateHealthMetrics(byMonth.get(key) ?? []);
      const score = this.calculateHealthScore({
        savingsRate: metrics.savingsRate,
        commitmentRate: metrics.commitmentRate,
        fixedExpenseRate: metrics.fixedExpenseRate,
        pendingRate: metrics.pendingRate,
        cashCoverageMonths: 0
      });

      return {
        month: format(monthRef, "MM/yyyy"),
        savingsRate: metrics.savingsRate,
        commitmentRate: metrics.commitmentRate,
        fixedExpenseRate: metrics.fixedExpenseRate,
        pendingRate: metrics.pendingRate,
        score: score.value
      };
    });
  }
}
