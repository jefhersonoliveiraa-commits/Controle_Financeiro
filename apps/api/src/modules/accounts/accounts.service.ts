import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import {
  createAccountSchema,
  type CreateAccountInput,
  updateAccountSchema,
  type UpdateAccountInput
} from "@financeiro/contracts";
import { validateWithZod } from "../../common/zod.js";
import { decimalToNumber } from "../../common/number.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { Prisma } from "@prisma/client";

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, payload: unknown) {
    const input = validateWithZod(createAccountSchema, payload);

    if (input.type !== "CREDIT_CARD" && (input.limit !== undefined || input.statementClosingDay || input.statementDueDay)) {
      throw new BadRequestException("Limite e dados de fatura sao permitidos apenas para contas do tipo Cartao de credito.");
    }

    return this.prisma.account.create({
      data: this.toPrismaInput(userId, input)
    });
  }

  async list(userId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { userId },
      orderBy: { name: "asc" }
    });

    return accounts.map((account) => ({
      ...account,
      initialBalance: decimalToNumber(account.initialBalance),
      creditLimit: account.creditLimit ? decimalToNumber(account.creditLimit) : null
    }));
  }

  async getById(userId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId }
    });
    if (!account) {
      throw new NotFoundException("Conta nao encontrada.");
    }
    return {
      ...account,
      initialBalance: decimalToNumber(account.initialBalance),
      creditLimit: account.creditLimit ? decimalToNumber(account.creditLimit) : null
    };
  }

  async update(userId: string, accountId: string, payload: unknown) {
    const input = validateWithZod(updateAccountSchema, payload);
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId }
    });
    if (!account) {
      throw new NotFoundException("Conta nao encontrada.");
    }

    const nextType = input.type ?? account.type;
    if (
      nextType !== "CREDIT_CARD" &&
      (input.limit !== undefined || input.statementClosingDay !== undefined || input.statementDueDay !== undefined)
    ) {
      throw new BadRequestException("Limite e dados de fatura sao permitidos apenas para contas do tipo Cartao de credito.");
    }

    const updated = await this.prisma.account.update({
      where: { id: account.id },
      data: this.toPrismaUpdateInput(account.type, input)
    });

    return {
      ...updated,
      initialBalance: decimalToNumber(updated.initialBalance),
      creditLimit: updated.creditLimit ? decimalToNumber(updated.creditLimit) : null
    };
  }

  async remove(userId: string, accountId: string) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, userId }
    });
    if (!account) {
      throw new NotFoundException("Conta nao encontrada.");
    }

    try {
      await this.prisma.account.delete({
        where: { id: account.id }
      });
      return { deleted: true, id: account.id };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new BadRequestException("Nao foi possivel excluir a conta porque existem registros vinculados.");
      }
      throw error;
    }
  }

  private toPrismaInput(userId: string, input: CreateAccountInput) {
    return {
      userId,
      name: input.name,
      type: input.type,
      initialBalance: input.initialBalance,
      initialBalanceDate: new Date(input.initialBalanceDate),
      creditLimit: input.type === "CREDIT_CARD" ? (input.limit ?? null) : null,
      statementClosingDay: input.type === "CREDIT_CARD" ? (input.statementClosingDay ?? null) : null,
      statementDueDay: input.type === "CREDIT_CARD" ? (input.statementDueDay ?? null) : null
    };
  }

  private toPrismaUpdateInput(
    currentType: "BANK_ACCOUNT" | "CASH" | "CREDIT_CARD",
    input: UpdateAccountInput
  ) {
    const nextType = input.type ?? currentType;
    return {
      name: input.name,
      type: input.type,
      initialBalance: input.initialBalance,
      initialBalanceDate: input.initialBalanceDate ? new Date(input.initialBalanceDate) : undefined,
      creditLimit:
        nextType === "CREDIT_CARD"
          ? input.limit === undefined
            ? undefined
            : input.limit
          : null,
      statementClosingDay:
        nextType === "CREDIT_CARD"
          ? input.statementClosingDay === undefined
            ? undefined
            : input.statementClosingDay
          : null,
      statementDueDay:
        nextType === "CREDIT_CARD"
          ? input.statementDueDay === undefined
            ? undefined
            : input.statementDueDay
          : null
    };
  }
}
