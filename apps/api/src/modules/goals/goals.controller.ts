import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { JwtPayload } from "../auth/auth.types.js";
import { JwtAuthGuard } from "../auth/jwt.guard.js";
import { GoalsService } from "./goals.service.js";

@Controller("goals")
@UseGuards(JwtAuthGuard)
export class GoalsController {
  constructor(private readonly goalsService: GoalsService) {}

  @Post()
  async create(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.goalsService.create(user.sub, body);
  }

  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    return this.goalsService.list(user.sub);
  }

  @Get(":id/details")
  async details(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.goalsService.getGoalDetails(id, user.sub);
  }

  @Patch(":id/recalculate")
  async recalculate(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.goalsService.recalculateGoal(user.sub, id);
  }

  @Patch(":id")
  async update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() body: unknown) {
    return this.goalsService.update(user.sub, id, body);
  }

  @Delete(":id")
  async remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.goalsService.remove(user.sub, id);
  }
}
