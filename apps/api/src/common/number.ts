import type { Prisma } from "@prisma/client";

type DecimalLike = Prisma.Decimal | number | string | { toString(): string } | null | undefined;

export function decimalToNumber(value: DecimalLike): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    return Number(value);
  }
  return Number(value.toString());
}

export function ensureNonNegative(value: number, fieldName = "valor"): void {
  if (value < 0) {
    throw new Error(`${fieldName} nao pode ser negativo.`);
  }
}
