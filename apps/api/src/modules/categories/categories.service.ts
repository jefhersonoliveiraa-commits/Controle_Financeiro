import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createCategorySchema, updateCategorySchema } from "@financeiro/contracts";
import { validateWithZod } from "../../common/zod.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { Prisma } from "@prisma/client";

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, payload: unknown) {
    const input = validateWithZod(createCategorySchema, payload);
    return this.prisma.category.create({
      data: {
        userId,
        name: input.name,
        type: input.type,
        color: input.color,
        icon: input.icon
      }
    });
  }

  async list(userId: string) {
    return this.prisma.category.findMany({
      where: { userId },
      orderBy: { name: "asc" }
    });
  }

  async update(userId: string, categoryId: string, payload: unknown) {
    const input = validateWithZod(updateCategorySchema, payload);
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId }
    });
    if (!category) {
      throw new NotFoundException("Categoria nao encontrada.");
    }

    try {
      return await this.prisma.category.update({
        where: { id: category.id },
        data: input
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BadRequestException("Ja existe uma categoria com este nome.");
      }
      throw error;
    }
  }

  async remove(userId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, userId }
    });
    if (!category) {
      throw new NotFoundException("Categoria nao encontrada.");
    }

    try {
      await this.prisma.category.delete({
        where: { id: category.id }
      });
      return { deleted: true, id: category.id };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
        throw new BadRequestException("Nao foi possivel excluir a categoria porque existem registros vinculados.");
      }
      throw error;
    }
  }
}
