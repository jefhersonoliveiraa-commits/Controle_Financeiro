import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createGoalSchema, type GoalProgressView, updateGoalSchema } from "@financeiro/contracts";
import { addMonths, format, isAfter, startOfMonth } from "date-fns";
import { monthsBetweenInclusive, recurrenceDateInMonth } from "../../common/date.js";
import { decimalToNumber } from "../../common/number.js";
import { validateWithZod } from "../../common/zod.js";
import { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, payload: unknown) {
    const input = validateWithZod(createGoalSchema, payload);
    await this.assertOwnership(userId, { accountId: input.accountId, categoryId: input.categoryId });
    const dueDate = new Date(input.dueDate);
    const accumulatedAmount = input.accumulatedAmount ?? 0;
    if (!isAfter(dueDate, new Date())) {
      throw new BadRequestException("Data final da meta deve estar no futuro.");
    }

    const monthsRemaining = monthsBetweenInclusive(new Date(), dueDate);
    const remaining = Number((input.targetAmount - accumulatedAmount).toFixed(2));
    if (remaining < 0) {
      throw new BadRequestException("Valor acumulado nao pode ser maior que o valor alvo.");
    }
    const baseMonthlyAmount = Number((remaining / monthsRemaining).toFixed(2));

    const goal = await this.prisma.goal.create({
      data: {
        userId,
        name: input.name,
        targetAmount: input.targetAmount,
        initialAccumulatedAmount: accumulatedAmount,
        accumulatedAmount,
        dueDate,
        accountId: input.accountId,
        categoryId: input.categoryId,
        saveDayOfMonth: input.saveDayOfMonth,
        status: "ACTIVE"
      }
    });

    const monthReferences = this.listMonthsUntilDueDate(dueDate);
    const roundedValues = this.distributeAmount(remaining, monthReferences.length, baseMonthlyAmount);

    await this.prisma.$transaction(
      monthReferences.flatMap((monthRef, index) => {
        const plannedAmount = roundedValues[index];
        const dueDateByMonth = recurrenceDateInMonth(monthRef, input.saveDayOfMonth);
        return [
          this.prisma.goalSchedule.create({
            data: {
              goalId: goal.id,
              monthReference: startOfMonth(monthRef),
              plannedAmount
            }
          }),
          this.prisma.transaction.create({
            data: {
              userId,
              type: "EXPENSE",
              description: `[META] ${goal.name} - ${format(monthRef, "MM/yyyy")}`,
              categoryId: goal.categoryId,
              accountId: goal.accountId,
              dueDate: dueDateByMonth,
              amountPlanned: plannedAmount,
              status: "PENDING",
              behavior: "VARIABLE",
              note: "Provisao automatica para meta financeira",
              goalId: goal.id,
              isProjected: true
            }
          })
        ];
      })
    );

    return this.getProgressByGoal(goal.id, userId);
  }

  async update(userId: string, goalId: string, payload: unknown) {
    const input = validateWithZod(updateGoalSchema, payload);
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, userId }
    });
    if (!goal) {
      throw new NotFoundException("Meta nao encontrada.");
    }

    if (input.accountId || input.categoryId) {
      await this.assertOwnership(userId, {
        accountId: input.accountId ?? goal.accountId,
        categoryId: input.categoryId ?? goal.categoryId
      });
    }

    if (input.dueDate) {
      const dueDate = new Date(input.dueDate);
      if (!isAfter(dueDate, new Date()) && (input.status ?? goal.status) === "ACTIVE") {
        throw new BadRequestException("Data final da meta deve estar no futuro para metas ativas.");
      }
    }

    await this.prisma.goal.update({
      where: { id: goal.id },
      data: {
        name: input.name,
        targetAmount: input.targetAmount,
        dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        accountId: input.accountId,
        categoryId: input.categoryId,
        saveDayOfMonth: input.saveDayOfMonth,
        status: input.status
      }
    });

    return this.recalculateGoal(userId, goal.id);
  }

  async remove(userId: string, goalId: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, userId }
    });
    if (!goal) {
      throw new NotFoundException("Meta nao encontrada.");
    }

    await this.prisma.$transaction([
      this.prisma.goal.update({
        where: { id: goal.id },
        data: { status: "CANCELED" }
      }),
      this.prisma.transaction.updateMany({
        where: { userId, goalId: goal.id, status: "PENDING" },
        data: { status: "CANCELED" }
      })
    ]);

    return { deleted: true, id: goal.id, softDeleted: true };
  }

  async list(userId: string): Promise<GoalProgressView[]> {
    const goals = await this.prisma.goal.findMany({
      where: { userId },
      orderBy: { dueDate: "asc" }
    });

    return Promise.all(goals.map((goal) => this.getProgressByGoal(goal.id, userId)));
  }

  async recalculateGoal(userId: string, goalId: string): Promise<GoalProgressView> {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, userId },
      include: {
        transactions: {
          where: { status: { not: "CANCELED" } },
          orderBy: { dueDate: "asc" }
        }
      }
    });

    if (!goal) {
      throw new NotFoundException("Meta nao encontrada.");
    }

    const paidSum = goal.transactions
      .filter((item) => item.status === "PAID" || item.status === "RECEIVED")
      .reduce((sum, item) => {
        const value = item.amountActual ? decimalToNumber(item.amountActual) : decimalToNumber(item.amountPlanned);
        return sum + value;
      }, 0);

    const newAccumulated = Number((decimalToNumber(goal.initialAccumulatedAmount) + paidSum).toFixed(2));
    const targetAmount = decimalToNumber(goal.targetAmount);
    const remainingAmount = Number(Math.max(targetAmount - newAccumulated, 0).toFixed(2));

    const today = new Date();
    const futurePending = goal.transactions.filter(
      (item) => item.status === "PENDING" && item.dueDate >= today
    );

    if (futurePending.length > 0) {
      const monthly = Number((remainingAmount / futurePending.length).toFixed(2));
      const distribution = this.distributeAmount(remainingAmount, futurePending.length, monthly);
      await this.prisma.$transaction(
        futurePending.map((item, index) =>
          this.prisma.transaction.update({
            where: { id: item.id },
            data: {
              amountPlanned: distribution[index]
            }
          })
        )
      );
    }

    await this.prisma.goal.update({
      where: { id: goal.id },
      data: {
        accumulatedAmount: newAccumulated,
        status: remainingAmount <= 0 ? "COMPLETED" : "ACTIVE"
      }
    });

    return this.getProgressByGoal(goal.id, userId);
  }

  async getProgressByGoal(goalId: string, userId: string): Promise<GoalProgressView> {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, userId }
    });

    if (!goal) {
      throw new NotFoundException("Meta nao encontrada.");
    }

    const targetAmount = decimalToNumber(goal.targetAmount);
    const accumulated = decimalToNumber(goal.accumulatedAmount);
    const remaining = Number(Math.max(targetAmount - accumulated, 0).toFixed(2));
    const monthsRemaining = monthsBetweenInclusive(new Date(), goal.dueDate);
    const requiredMonthlyAverage = Number((remaining / monthsRemaining).toFixed(2));
    const progressPercent = Number(Math.min((accumulated / targetAmount) * 100, 100).toFixed(2));

    return {
      goalId: goal.id,
      name: goal.name,
      targetAmount,
      accumulatedAmount: accumulated,
      remainingAmount: remaining,
      progressPercent,
      requiredMonthlyAverage,
      monthsRemaining
    };
  }

  async getGoalDetails(goalId: string, userId: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, userId },
      include: {
        account: true,
        category: true,
        transactions: {
          where: { status: { not: "CANCELED" } },
          include: {
            account: true,
            category: true
          },
          orderBy: { dueDate: "asc" }
        }
      }
    });

    if (!goal) {
      throw new NotFoundException("Meta nao encontrada.");
    }

    const progress = await this.getProgressByGoal(goal.id, userId);
    const plannedTotal = goal.transactions.reduce(
      (sum, item) => sum + decimalToNumber(item.amountPlanned),
      0
    );
    const settledTotal = goal.transactions
      .filter((item) => item.status === "PAID" || item.status === "RECEIVED")
      .reduce((sum, item) => {
        const value = item.amountActual ? decimalToNumber(item.amountActual) : decimalToNumber(item.amountPlanned);
        return sum + value;
      }, 0);

    return {
      ...progress,
      dueDate: goal.dueDate.toISOString(),
      saveDayOfMonth: goal.saveDayOfMonth,
      account: {
        id: goal.account.id,
        name: goal.account.name
      },
      category: {
        id: goal.category.id,
        name: goal.category.name
      },
      totals: {
        plannedTotal: Number(plannedTotal.toFixed(2)),
        settledTotal: Number(settledTotal.toFixed(2)),
        pendingTotal: Number((plannedTotal - settledTotal).toFixed(2))
      },
      transactions: goal.transactions.map((item) => ({
        id: item.id,
        description: item.description,
        dueDate: item.dueDate.toISOString(),
        status: item.status,
        behavior: item.behavior,
        amountPlanned: decimalToNumber(item.amountPlanned),
        amountActual: item.amountActual ? decimalToNumber(item.amountActual) : null,
        account: item.account.name,
        category: item.category.name
      }))
    };
  }

  private listMonthsUntilDueDate(dueDate: Date): Date[] {
    const months = monthsBetweenInclusive(new Date(), dueDate);
    return Array.from({ length: months }, (_, idx) => addMonths(startOfMonth(new Date()), idx));
  }

  private distributeAmount(total: number, pieces: number, baseValue: number): number[] {
    if (pieces <= 0) {
      return [];
    }
    const values = Array.from({ length: pieces }, () => baseValue);
    const currentSum = values.reduce((sum, item) => sum + item, 0);
    const diff = Number((total - currentSum).toFixed(2));
    values[pieces - 1] = Number((values[pieces - 1] + diff).toFixed(2));
    return values;
  }

  private async assertOwnership(
    userId: string,
    input: { accountId: string; categoryId: string }
  ) {
    const [account, category] = await this.prisma.$transaction([
      this.prisma.account.findFirst({ where: { id: input.accountId, userId }, select: { id: true } }),
      this.prisma.category.findFirst({ where: { id: input.categoryId, userId }, select: { id: true } })
    ]);

    if (!account) {
      throw new NotFoundException("Conta informada nao pertence ao usuario.");
    }
    if (!category) {
      throw new NotFoundException("Categoria informada nao pertence ao usuario.");
    }
  }
}
