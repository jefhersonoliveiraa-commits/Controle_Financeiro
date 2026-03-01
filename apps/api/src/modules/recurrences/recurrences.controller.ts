import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { JwtPayload } from "../auth/auth.types.js";
import { JwtAuthGuard } from "../auth/jwt.guard.js";
import { RecurrencesService } from "./recurrences.service.js";

@Controller("recurrences")
@UseGuards(JwtAuthGuard)
export class RecurrencesController {
  constructor(private readonly recurrencesService: RecurrencesService) {}

  @Post()
  async create(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.recurrencesService.create(user.sub, body);
  }

  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    return this.recurrencesService.list(user.sub);
  }

  @Post("generate-monthly")
  async generate(
    @CurrentUser() user: JwtPayload,
    @Query("reference") reference?: string
  ) {
    return this.recurrencesService.generateMonthlyTransactions(user.sub, reference);
  }

  @Patch(":id")
  async update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() body: unknown) {
    return this.recurrencesService.update(user.sub, id, body);
  }

  @Delete(":id")
  async remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.recurrencesService.remove(user.sub, id);
  }
}
