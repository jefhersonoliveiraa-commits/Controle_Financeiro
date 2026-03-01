import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  budgetsQuerySchema,
  createCategoryBudgetSchema,
  dismissBudgetAlertSchema,
  type BudgetAlertLevel,
  updateCategoryBudgetSchema
} from "@financeiro/contracts";
import { Prisma } from "@prisma/client";
import { format, startOfMonth } from "date-fns";
import { decimalToNumber } from "../../common/number.js";
import { validateWithZod } from "../../common/zod.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { RecurrencesService } from "../recurrences/recurrences.service.js";

type BudgetTotals = {
  spent: number;
  pending: number;
  projected: number;
};

@Injectable()
export class BudgetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly recurrencesService: RecurrencesService
  ) {}

  async createCategoryBudget(userId: string, payload: unknown) {
    const input = validateWithZod(createCategoryBudgetSchema, payload);
    const monthReference = this.parseMonthReference(input.monthReference);
    const category = await this.assertCategoryOwnership(userId, input.categoryId);

    if (category.type === "INCOME") {
      throw new BadRequestException("Limite por categoria e permitido apenas para despesa.");
    }

    try {
      const created = await this.prisma.categoryBudget.create({
        data: {
          userId,
          categoryId: input.categoryId,
          monthReference,
          limitAmount: input.limitAmount,
          warningThreshold: input.warningThreshold,
          criticalThreshold: input.criticalThreshold
        },
        include: {
          category: true
        }
      });

      const monthResult = await this.getMonthOverview(userId, monthReference);
      return monthResult.items.find((item) => item.id === created.id) ?? this.mapFallbackBudget(created);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BadRequestException("Ja existe limite para essa categoria neste mes.");
      }
      throw error;
    }
  }

  async listCategoryBudgets(userId: string, query: unknown) {
    const parsed = validateWithZod(budgetsQuerySchema, query ?? {});
    const monthReference = this.parseMonthReference(parsed.monthReference);
    const monthResult = await this.getMonthOverview(userId, monthReference);
    return monthResult.items;
  }

  async getOverview(userId: string, query: unknown) {
    const parsed = validateWithZod(budgetsQuerySchema, query ?? {});
    const monthReference = this.parseMonthReference(parsed.monthReference);
    const monthResult = await this.getMonthOverview(userId, monthReference);

    const totals = monthResult.items.reduce(
      (acc, item) => {
        acc.totalLimit += item.limitAmount;
        acc.totalSpent += item.spent;
        acc.totalPending += item.pending;
        acc.totalProjected += item.projected;
        return acc;
      },
      {
        totalLimit: 0,
        totalSpent: 0,
        totalPending: 0,
        totalProjected: 0
      }
    );

    return {
      monthReference: format(monthReference, "yyyy-MM"),
      totals: {
        budgetCount: monthResult.items.length,
        overBudgetCount: monthResult.items.filter((item) => item.projected > item.limitAmount).length,
        totalLimit: Number(totals.totalLimit.toFixed(2)),
        totalSpent: Number(totals.totalSpent.toFixed(2)),
        totalPending: Number(totals.totalPending.toFixed(2)),
        totalProjected: Number(totals.totalProjected.toFixed(2)),
        totalRemaining: Number((totals.totalLimit - totals.totalSpent).toFixed(2))
      },
      items: monthResult.items
    };
  }

  async updateCategoryBudget(userId: string, budgetId: string, payload: unknown) {
    const input = validateWithZod(updateCategoryBudgetSchema, payload);
    const budget = await this.prisma.categoryBudget.findFirst({
      where: { id: budgetId, userId },
      include: { category: true }
    });

    if (!budget) {
      throw new NotFoundException("Limite de categoria nao encontrado.");
    }

    const warningThreshold = input.warningThreshold ?? budget.warningThreshold;
    const criticalThreshold = input.criticalThreshold ?? budget.criticalThreshold;
    if (warningThreshold >= criticalThreshold) {
      throw new BadRequestException("warningThreshold deve ser menor que criticalThreshold.");
    }

    const updated = await this.prisma.categoryBudget.update({
      where: { id: budget.id },
      data: {
        limitAmount: input.limitAmount,
        warningThreshold: input.warningThreshold,
        criticalThreshold: input.criticalThreshold
      },
      include: {
        category: true
      }
    });

    const monthResult = await this.getMonthOverview(userId, updated.monthReference);
    return monthResult.items.find((item) => item.id === updated.id) ?? this.mapFallbackBudget(updated);
  }

  async removeCategoryBudget(userId: string, budgetId: string) {
    const budget = await this.prisma.categoryBudget.findFirst({
      where: { id: budgetId, userId },
      select: { id: true }
    });

    if (!budget) {
      throw new NotFoundException("Limite de categoria nao encontrado.");
    }

    await this.prisma.categoryBudget.delete({ where: { id: budget.id } });
    return { deleted: true, id: budget.id };
  }

  async getAlerts(userId: string, query: unknown) {
    const parsed = validateWithZod(budgetsQuerySchema, query ?? {});
    const monthReference = this.parseMonthReference(parsed.monthReference);
    await this.syncAlerts(userId, monthReference);

    const alerts = await this.prisma.budgetAlert.findMany({
      where: {
        userId,
        monthReference,
        dismissedAt: null
      },
      include: {
        budget: {
          include: {
            category: true
          }
        }
      },
      orderBy: [{ thresholdPercent: "desc" }, { createdAt: "desc" }]
    });

    return alerts.map((alert) => ({
      id: alert.id,
      monthReference: format(alert.monthReference, "yyyy-MM"),
      level: alert.level as BudgetAlertLevel,
      categoryId: alert.budget.categoryId,
      categoryName: alert.budget.category.name,
      limitAmount: decimalToNumber(alert.limitAmount),
      spent: decimalToNumber(alert.spentAmount),
      projected: decimalToNumber(alert.projectedAmount),
      thresholdPercent: alert.thresholdPercent,
      message: alert.message,
      dismissedAt: alert.dismissedAt?.toISOString() ?? null
    }));
  }

  async dismissAlert(userId: string, alertId: string, payload: unknown) {
    const input = validateWithZod(dismissBudgetAlertSchema, payload ?? {});
    const alert = await this.prisma.budgetAlert.findFirst({
      where: { id: alertId, userId }
    });

    if (!alert) {
      throw new NotFoundException("Alerta de orcamento nao encontrado.");
    }

    const updated = await this.prisma.budgetAlert.update({
      where: { id: alert.id },
      data: {
        dismissedAt: input.dismissed ? new Date() : null
      },
      include: {
        budget: {
          include: {
            category: true
          }
        }
      }
    });

    return {
      id: updated.id,
      monthReference: format(updated.monthReference, "yyyy-MM"),
      level: updated.level as BudgetAlertLevel,
      categoryId: updated.budget.categoryId,
      categoryName: updated.budget.category.name,
      limitAmount: decimalToNumber(updated.limitAmount),
      spent: decimalToNumber(updated.spentAmount),
      projected: decimalToNumber(updated.projectedAmount),
      thresholdPercent: updated.thresholdPercent,
      message: updated.message,
      dismissedAt: updated.dismissedAt?.toISOString() ?? null
    };
  }

  private async getMonthOverview(userId: string, monthReference: Date) {
    const budgets = await this.prisma.categoryBudget.findMany({
      where: { userId, monthReference },
      include: { category: true },
      orderBy: [{ category: { name: "asc" } }]
    });

    const totalsByCategory = await this.computeBudgetTotals(
      userId,
      monthReference,
      budgets.map((item) => item.categoryId)
    );

    await this.syncAlerts(userId, monthReference, budgets, totalsByCategory);

    const activeAlerts = await this.prisma.budgetAlert.findMany({
      where: {
        userId,
        monthReference,
        dismissedAt: null
      },
      select: {
        budgetId: true,
        level: true
      }
    });

    const alertByBudget = new Map<string, BudgetAlertLevel>();
    for (const alert of activeAlerts) {
      const current = alertByBudget.get(alert.budgetId);
      if (!current || this.alertRank(alert.level) > this.alertRank(current)) {
        alertByBudget.set(alert.budgetId, alert.level as BudgetAlertLevel);
      }
    }

    const items = budgets.map((budget) => {
      const totals = totalsByCategory.get(budget.categoryId) ?? { spent: 0, pending: 0, projected: 0 };
      const limitAmount = decimalToNumber(budget.limitAmount);
      const spent = Number(totals.spent.toFixed(2));
      const pending = Number(totals.pending.toFixed(2));
      const projected = Number(totals.projected.toFixed(2));
      const remaining = Number((limitAmount - spent).toFixed(2));
      const utilizationPercent = limitAmount > 0 ? Number(((spent / limitAmount) * 100).toFixed(2)) : 0;
      const projectedUtilizationPercent =
        limitAmount > 0 ? Number(((projected / limitAmount) * 100).toFixed(2)) : 0;

      return {
        id: budget.id,
        categoryId: budget.categoryId,
        categoryName: budget.category.name,
        monthReference: format(budget.monthReference, "yyyy-MM"),
        limitAmount,
        warningThreshold: budget.warningThreshold,
        criticalThreshold: budget.criticalThreshold,
        spent,
        pending,
        projected,
        remaining,
        utilizationPercent,
        projectedUtilizationPercent,
        alertLevel: alertByBudget.get(budget.id) ?? "NONE"
      };
    });

    return { items, totalsByCategory };
  }

  private async syncAlerts(
    userId: string,
    monthReference: Date,
    givenBudgets?: Array<{
      id: string;
      userId: string;
      categoryId: string;
      monthReference: Date;
      limitAmount: Prisma.Decimal;
      warningThreshold: number;
      criticalThreshold: number;
      category: { id: string; name: string; type: "INCOME" | "EXPENSE" | "BOTH" };
    }>,
    givenTotals?: Map<string, BudgetTotals>
  ) {
    const budgets =
      givenBudgets ??
      (await this.prisma.categoryBudget.findMany({
        where: { userId, monthReference },
        include: { category: true }
      }));

    if (budgets.length === 0) {
      return;
    }

    const totalsByCategory =
      givenTotals ??
      (await this.computeBudgetTotals(
        userId,
        monthReference,
        budgets.map((item) => item.categoryId)
      ));

    for (const budget of budgets) {
      const totals = totalsByCategory.get(budget.categoryId) ?? { spent: 0, pending: 0, projected: 0 };
      const limitAmount = decimalToNumber(budget.limitAmount);
      const projectedPercent = limitAmount > 0 ? (totals.projected / limitAmount) * 100 : 0;

      const levels: Array<{ level: BudgetAlertLevel; thresholdPercent: number; message: string }> = [];
      if (projectedPercent >= budget.warningThreshold) {
        levels.push({
          level: "WARNING",
          thresholdPercent: budget.warningThreshold,
          message: `Categoria ${budget.category.name} atingiu ${projectedPercent.toFixed(2)}% do limite no mes.`
        });
      }
      if (projectedPercent >= budget.criticalThreshold) {
        levels.push({
          level: "CRITICAL",
          thresholdPercent: budget.criticalThreshold,
          message: `Categoria ${budget.category.name} esta em nivel critico (${projectedPercent.toFixed(2)}%).`
        });
      }
      if (projectedPercent >= 100) {
        levels.push({
          level: "EXCEEDED",
          thresholdPercent: 100,
          message: `Categoria ${budget.category.name} excedeu o limite mensal (${projectedPercent.toFixed(2)}%).`
        });
      }

      const activeLevels = new Set(levels.map((item) => item.level));
      await this.prisma.budgetAlert.deleteMany({
        where: {
          budgetId: budget.id,
          monthReference,
          level: { notIn: Array.from(activeLevels) }
        }
      });

      for (const entry of levels) {
        await this.prisma.budgetAlert.upsert({
          where: {
            budgetId_monthReference_level: {
              budgetId: budget.id,
              monthReference,
              level: entry.level
            }
          },
          create: {
            userId,
            budgetId: budget.id,
            monthReference,
            level: entry.level,
            thresholdPercent: entry.thresholdPercent,
            spentAmount: totals.spent,
            projectedAmount: totals.projected,
            limitAmount,
            message: entry.message
          },
          update: {
            thresholdPercent: entry.thresholdPercent,
            spentAmount: totals.spent,
            projectedAmount: totals.projected,
            limitAmount,
            message: entry.message
          }
        });
      }
    }
  }

  private async computeBudgetTotals(
    userId: string,
    monthReference: Date,
    categoryIds: string[]
  ): Promise<Map<string, BudgetTotals>> {
    const totals = new Map<string, BudgetTotals>();
    if (categoryIds.length === 0) {
      return totals;
    }

    const monthStart = startOfMonth(monthReference);
    const monthEnd = this.endOfMonth(monthReference);

    const rows = await this.prisma.transaction.findMany({
      where: {
        userId,
        type: "EXPENSE",
        categoryId: { in: categoryIds },
        status: { not: "CANCELED" },
        dueDate: { gte: monthStart, lte: monthEnd }
      },
      select: {
        categoryId: true,
        status: true,
        amountPlanned: true,
        amountActual: true
      }
    });

    for (const row of rows) {
      const current = totals.get(row.categoryId) ?? { spent: 0, pending: 0, projected: 0 };
      const resolvedAmount =
        (row.status === "PAID" || row.status === "RECEIVED") && row.amountActual
          ? decimalToNumber(row.amountActual)
          : decimalToNumber(row.amountPlanned);

      if (row.status === "PAID" || row.status === "RECEIVED") {
        current.spent += resolvedAmount;
      } else {
        current.pending += resolvedAmount;
      }
      totals.set(row.categoryId, current);
    }

    const projectedRows = await this.recurrencesService.projectedForRange(userId, monthStart, monthEnd);
    for (const row of projectedRows) {
      if (row.type !== "EXPENSE") continue;
      if (!categoryIds.includes(row.category.id)) continue;
      const current = totals.get(row.category.id) ?? { spent: 0, pending: 0, projected: 0 };
      current.pending += row.amountPlanned;
      totals.set(row.category.id, current);
    }

    for (const [categoryId, value] of totals) {
      value.projected = value.spent + value.pending;
      totals.set(categoryId, value);
    }

    return totals;
  }

  private mapFallbackBudget(input: {
    id: string;
    categoryId: string;
    category: { name: string };
    monthReference: Date;
    limitAmount: Prisma.Decimal;
    warningThreshold: number;
    criticalThreshold: number;
  }) {
    const limitAmount = decimalToNumber(input.limitAmount);
    return {
      id: input.id,
      categoryId: input.categoryId,
      categoryName: input.category.name,
      monthReference: format(input.monthReference, "yyyy-MM"),
      limitAmount,
      warningThreshold: input.warningThreshold,
      criticalThreshold: input.criticalThreshold,
      spent: 0,
      pending: 0,
      projected: 0,
      remaining: limitAmount,
      utilizationPercent: 0,
      projectedUtilizationPercent: 0,
      alertLevel: "NONE" as const
    };
  }

  private parseMonthReference(value?: string) {
    if (!value) {
      return startOfMonth(new Date());
    }

    const [yearRaw, monthRaw] = value.split("-");
    const year = Number(yearRaw);
    const month = Number(monthRaw);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException("Referencia invalida. Use o formato YYYY-MM.");
    }

    return new Date(year, month - 1, 1);
  }

  private endOfMonth(value: Date) {
    return new Date(value.getFullYear(), value.getMonth() + 1, 0, 23, 59, 59, 999);
  }

  private alertRank(level: BudgetAlertLevel) {
    if (level === "EXCEEDED") return 3;
    if (level === "CRITICAL") return 2;
    if (level === "WARNING") return 1;
    return 0;
  }

  private async assertCategoryOwnership(userId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId },
      select: { id: true, name: true, type: true }
    });

    if (!category) {
      throw new NotFoundException("Categoria nao encontrada.");
    }

    return category;
  }
}
