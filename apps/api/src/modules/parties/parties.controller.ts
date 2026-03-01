import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { PartiesService } from "./parties.service.js";
import { JwtAuthGuard } from "../auth/jwt.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { JwtPayload } from "../auth/auth.types.js";

@Controller("parties")
@UseGuards(JwtAuthGuard)
export class PartiesController {
  constructor(private readonly partiesService: PartiesService) {}

  @Post()
  async create(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.partiesService.create(user.sub, body);
  }

  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    return this.partiesService.list(user.sub);
  }

  @Patch(":id")
  async update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() body: unknown) {
    return this.partiesService.update(user.sub, id, body);
  }

  @Delete(":id")
  async remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.partiesService.remove(user.sub, id);
  }
}
