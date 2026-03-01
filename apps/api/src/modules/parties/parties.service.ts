import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { createPartySchema, updatePartySchema } from "@financeiro/contracts";
import { validateWithZod } from "../../common/zod.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { Prisma } from "@prisma/client";

@Injectable()
export class PartiesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, payload: unknown) {
    const input = validateWithZod(createPartySchema, payload);
    return this.prisma.party.create({
      data: {
        userId,
        name: input.name,
        type: input.type
      }
    });
  }

  async list(userId: string) {
    return this.prisma.party.findMany({
      where: { userId },
      orderBy: { name: "asc" }
    });
  }

  async update(userId: string, partyId: string, payload: unknown) {
    const input = validateWithZod(updatePartySchema, payload);
    const party = await this.prisma.party.findFirst({
      where: { id: partyId, userId }
    });
    if (!party) {
      throw new NotFoundException("Parte nao encontrada.");
    }

    try {
      return await this.prisma.party.update({
        where: { id: party.id },
        data: input
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new BadRequestException("Ja existe uma parte com este nome.");
      }
      throw error;
    }
  }

  async remove(userId: string, partyId: string) {
    const party = await this.prisma.party.findFirst({
      where: { id: partyId, userId }
    });
    if (!party) {
      throw new NotFoundException("Parte nao encontrada.");
    }

    await this.prisma.party.delete({
      where: { id: party.id }
    });
    return { deleted: true, id: party.id };
  }
}
