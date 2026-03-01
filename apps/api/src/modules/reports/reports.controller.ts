import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { JwtPayload } from "../auth/auth.types.js";
import { JwtAuthGuard } from "../auth/jwt.guard.js";
import { ReportsService } from "./reports.service.js";

@Controller("reports")
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get("summary")
  async summary(@CurrentUser() user: JwtPayload, @Query() query: Record<string, string>) {
    return this.reportsService.summary(user.sub, query);
  }

  @Get("health")
  async health(@CurrentUser() user: JwtPayload, @Query() query: Record<string, string>) {
    return this.reportsService.health(user.sub, query);
  }
}
