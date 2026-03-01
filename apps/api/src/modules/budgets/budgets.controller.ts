import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { JwtPayload } from "../auth/auth.types.js";
import { JwtAuthGuard } from "../auth/jwt.guard.js";
import { BudgetsService } from "./budgets.service.js";

@Controller("budgets")
@UseGuards(JwtAuthGuard)
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Post("categories")
  async createCategoryBudget(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.budgetsService.createCategoryBudget(user.sub, body);
  }

  @Get("categories")
  async listCategoryBudgets(
    @CurrentUser() user: JwtPayload,
    @Query() query: Record<string, unknown>
  ) {
    return this.budgetsService.listCategoryBudgets(user.sub, query);
  }

  @Patch("categories/:id")
  async updateCategoryBudget(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    return this.budgetsService.updateCategoryBudget(user.sub, id, body);
  }

  @Delete("categories/:id")
  async removeCategoryBudget(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.budgetsService.removeCategoryBudget(user.sub, id);
  }

  @Get("overview")
  async overview(@CurrentUser() user: JwtPayload, @Query() query: Record<string, unknown>) {
    return this.budgetsService.getOverview(user.sub, query);
  }

  @Get("alerts")
  async alerts(@CurrentUser() user: JwtPayload, @Query() query: Record<string, unknown>) {
    return this.budgetsService.getAlerts(user.sub, query);
  }

  @Patch("alerts/:id/dismiss")
  async dismissAlert(
    @CurrentUser() user: JwtPayload,
    @Param("id") id: string,
    @Body() body: unknown
  ) {
    return this.budgetsService.dismissAlert(user.sub, id, body);
  }
}
