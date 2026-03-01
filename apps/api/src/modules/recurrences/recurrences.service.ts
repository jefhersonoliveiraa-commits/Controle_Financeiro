import { Injectable, NotFoundException } from "@nestjs/common";
import { createRecurrenceSchema, updateRecurrenceSchema } from "@financeiro/contracts";
import { addDays, addWeeks, endOfMonth, format, isAfter, isBefore, isEqual, startOfMonth } from "date-fns";
import { recurrenceDateInMonth } from "../../common/date.js";
import { decimalToNumber } from "../../common/number.js";
import { validateWithZod } from "../../common/zod.js";
import { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class RecurrencesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, payload: unknown) {
    const input = validateWithZod(createRecurrenceSchema, payload);
    await this.assertOwnership(userId, { accountId: input.accountId, categoryId: input.categoryId });
    return this.prisma.recurrence.create({
      data: {
        userId,
        type: input.type,
        description: input.description,
        defaultAmount: input.defaultAmount,
        behavior: input.behavior,
        dayOfMonth: input.dayOfMonth,
        frequency: input.frequency,
        accountId: input.accountId,
        categoryId: input.categoryId,
        startsAt: new Date(input.startsAt),
        endsAt: input.endsAt ? new Date(input.endsAt) : null,
        autoGenerateMonthly: input.autoGenerateMonthly
      }
    });
  }

  async list(userId: string) {
    const rows = await this.prisma.recurrence.findMany({
      where: { userId },
      include: { account: true, category: true },
      orderBy: { description: "asc" }
    });

    return rows.map((item) => ({
      ...item,
      defaultAmount: decimalToNumber(item.defaultAmount)
    }));
  }

  async update(userId: string, recurrenceId: string, payload: unknown) {
    const input = validateWithZod(updateRecurrenceSchema, payload);
    const recurrence = await this.prisma.recurrence.findFirst({
      where: { id: recurrenceId, userId }
    });
    if (!recurrence) {
      throw new NotFoundException("Recorrencia nao encontrada.");
    }

    if (input.accountId || input.categoryId) {
      await this.assertOwnership(userId, {
        accountId: input.accountId ?? recurrence.accountId,
        categoryId: input.categoryId ?? recurrence.categoryId
      });
    }

    const updated = await this.prisma.recurrence.update({
      where: { id: recurrence.id },
      data: {
        type: input.type,
        description: input.description,
        defaultAmount: input.defaultAmount,
        behavior: input.behavior,
        dayOfMonth: input.dayOfMonth,
        accountId: input.accountId,
        categoryId: input.categoryId,
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        endsAt: input.endsAt === undefined ? undefined : input.endsAt ? new Date(input.endsAt) : null,
        frequency: input.frequency,
        autoGenerateMonthly: input.autoGenerateMonthly
      },
      include: { account: true, category: true }
    });

    return {
      ...updated,
      defaultAmount: decimalToNumber(updated.defaultAmount)
    };
  }

  async remove(userId: string, recurrenceId: string) {
    const recurrence = await this.prisma.recurrence.findFirst({
      where: { id: recurrenceId, userId }
    });
    if (!recurrence) {
      throw new NotFoundException("Recorrencia nao encontrada.");
    }

    await this.prisma.recurrence.delete({
      where: { id: recurrence.id }
    });
    return { deleted: true, id: recurrence.id };
  }

  async generateMonthlyTransactions(userId: string, reference?: string) {
    const baseDate = reference ? new Date(`${reference}-01T00:00:00.000Z`) : new Date();
    const monthStart = startOfMonth(baseDate);
    const monthEnd = endOfMonth(baseDate);

    const recurrences = await this.prisma.recurrence.findMany({
      where: {
        userId,
        autoGenerateMonthly: true,
        startsAt: { lte: monthEnd },
        OR: [{ endsAt: null }, { endsAt: { gte: monthStart } }]
      }
    });

    const createdIds: string[] = [];
    for (const recurrence of recurrences) {
      const dueDates = this.generateDatesForRange(recurrence, monthStart, monthEnd);
      for (const dueDate of dueDates) {
        const existing = await this.prisma.transaction.findFirst({
          where: {
            userId,
            recurrenceId: recurrence.id,
            dueDate: {
              gte: new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate(), 0, 0, 0, 0),
              lt: new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate(), 23, 59, 59, 999)
            }
          }
        });
        if (existing) {
          continue;
        }

        const created = await this.prisma.transaction.create({
          data: {
            userId,
            type: recurrence.type,
            description: recurrence.description,
            categoryId: recurrence.categoryId,
            accountId: recurrence.accountId,
            dueDate,
            amountPlanned: recurrence.defaultAmount,
            status: "PENDING",
            behavior: recurrence.behavior,
            recurrenceId: recurrence.id,
            source: "RECURRENCE",
            isProjected: false
          }
        });
        createdIds.push(created.id);
      }
    }

    return { reference: format(monthStart, "yyyy-MM"), createdCount: createdIds.length, createdIds };
  }

  async projectedForRange(userId: string, startDate: Date, endDate: Date) {
    const recurrences = await this.prisma.recurrence.findMany({
      where: {
        userId,
        startsAt: { lte: endDate },
        OR: [{ endsAt: null }, { endsAt: { gte: startDate } }]
      },
      include: { account: true, category: true }
    });

    const existing = await this.prisma.transaction.findMany({
      where: {
        userId,
        recurrenceId: { not: null },
        dueDate: { gte: startDate, lte: endDate }
      },
      select: { recurrenceId: true, dueDate: true }
    });

    const existingMap = new Set(
      existing.map((item) => `${item.recurrenceId}:${item.dueDate.toISOString().slice(0, 10)}`)
    );

    return recurrences.flatMap((recurrence) => {
      const dates = this.generateDatesForRange(recurrence, startDate, endDate);
      return dates
        .filter((date) => !existingMap.has(`${recurrence.id}:${date.toISOString().slice(0, 10)}`))
        .map((dueDate) => ({
          id: `projected-recurrence-${recurrence.id}-${dueDate.toISOString().slice(0, 10)}`,
          description: recurrence.description,
          type: recurrence.type,
          status: "PENDING" as const,
          behavior: recurrence.behavior,
          dueDate,
          amountPlanned: decimalToNumber(recurrence.defaultAmount),
          amountActual: null,
          category: {
            id: recurrence.category.id,
            name: recurrence.category.name,
            color: recurrence.category.color
          },
          account: {
            id: recurrence.account.id,
            name: recurrence.account.name,
            type: recurrence.account.type
          },
          isProjected: true
        }));
    });
  }

  private generateDatesForRange(
    recurrence: {
      startsAt: Date;
      endsAt: Date | null;
      frequency: "MONTHLY" | "BIWEEKLY" | "WEEKLY";
      dayOfMonth: number;
    },
    startDate: Date,
    endDate: Date
  ): Date[] {
    if (recurrence.frequency === "MONTHLY") {
      const monthDates: Date[] = [];
      let cursor = startOfMonth(startDate);
      const monthEnd = endOfMonth(endDate);

      while (isBefore(cursor, monthEnd) || isEqual(cursor, monthEnd)) {
        const candidate = recurrenceDateInMonth(cursor, recurrence.dayOfMonth);
        if (
          (isAfter(candidate, recurrence.startsAt) || isEqual(candidate, recurrence.startsAt)) &&
          (isAfter(candidate, startDate) || isEqual(candidate, startDate)) &&
          (isBefore(candidate, endDate) || isEqual(candidate, endDate)) &&
          (!recurrence.endsAt || isBefore(candidate, recurrence.endsAt) || isEqual(candidate, recurrence.endsAt))
        ) {
          monthDates.push(candidate);
        }
        cursor = addDays(endOfMonth(cursor), 1);
      }
      return monthDates;
    }

    const dates: Date[] = [];
    let cursor = recurrence.startsAt;
    const stepInDays = recurrence.frequency === "WEEKLY" ? 7 : 14;
    while (isBefore(cursor, endDate) || isEqual(cursor, endDate)) {
      const inRange = (isAfter(cursor, startDate) || isEqual(cursor, startDate)) &&
        (!recurrence.endsAt || isBefore(cursor, recurrence.endsAt) || isEqual(cursor, recurrence.endsAt));
      if (inRange) {
        dates.push(cursor);
      }
      cursor = recurrence.frequency === "WEEKLY" ? addWeeks(cursor, 1) : addDays(cursor, stepInDays);
    }

    return dates;
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
