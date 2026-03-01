import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { JwtPayload } from "../auth/auth.types.js";
import { JwtAuthGuard } from "../auth/jwt.guard.js";
import { CashflowService } from "./cashflow.service.js";

@Controller("cashflow")
@UseGuards(JwtAuthGuard)
export class CashflowController {
  constructor(private readonly cashflowService: CashflowService) {}

  @Get()
  async forecast(@CurrentUser() user: JwtPayload, @Query() query: Record<string, unknown>) {
    return this.cashflowService.getDailyForecast(user.sub, query);
  }

  @Get("day/:date")
  async day(
    @CurrentUser() user: JwtPayload,
    @Param("date") date: string,
    @Query("accountIds") accountIds?: string
  ) {
    const parsedIds = accountIds ? accountIds.split(",").filter(Boolean) : undefined;
    return this.cashflowService.getDayTransactions(user.sub, date, parsedIds);
  }
}
