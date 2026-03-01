import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarMonths,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  isAfter,
  isBefore,
  isEqual,
  max,
  min,
  startOfDay,
  startOfMonth
} from "date-fns";
import type { RecurrenceFrequency } from "@financeiro/contracts";

export function normalizedInterval(startDate: Date, endDate: Date): { startDate: Date; endDate: Date } {
  return {
    startDate: startOfDay(min([startDate, endDate])),
    endDate: endOfDay(max([startDate, endDate]))
  };
}

export function generateDatesByFrequency(
  firstDate: Date,
  total: number,
  frequency: RecurrenceFrequency
): Date[] {
  const dates: Date[] = [];
  for (let index = 0; index < total; index += 1) {
    if (frequency === "WEEKLY") {
      dates.push(addWeeks(firstDate, index));
      continue;
    }

    if (frequency === "BIWEEKLY") {
      dates.push(addDays(firstDate, index * 14));
      continue;
    }

    dates.push(addMonths(firstDate, index));
  }
  return dates;
}

export function monthsBetweenInclusive(startDate: Date, endDate: Date): number {
  const raw = differenceInCalendarMonths(startOfMonth(endDate), startOfMonth(startDate));
  return Math.max(raw + 1, 1);
}

export function listDays(startDate: Date, endDate: Date): Date[] {
  return eachDayOfInterval({ start: startOfDay(startDate), end: endOfDay(endDate) });
}

export function isInsideRange(target: Date, startDate: Date, endDate: Date): boolean {
  return (
    (isAfter(target, startDate) || isEqual(target, startDate)) &&
    (isBefore(target, endDate) || isEqual(target, endDate))
  );
}

export function recurrenceDateInMonth(monthRef: Date, dayOfMonth: number): Date {
  const monthStart = startOfMonth(monthRef);
  const monthEnd = endOfMonth(monthRef);
  const adjustedDay = Math.min(dayOfMonth, monthEnd.getDate());
  return new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    adjustedDay,
    12,
    0,
    0,
    0
  );
}
