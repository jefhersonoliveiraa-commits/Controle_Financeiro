import { Controller, Get, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { JwtPayload } from "../auth/auth.types.js";
import { JwtAuthGuard } from "../auth/jwt.guard.js";
import { ExportsService } from "./exports.service.js";

@Controller("exports")
@UseGuards(JwtAuthGuard)
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get("transactions.csv")
  async csv(
    @CurrentUser() user: JwtPayload,
    @Query() query: Record<string, string>,
    @Res() response: Response
  ) {
    const csv = await this.exportsService.buildTransactionsCsv(user.sub, query);
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", "attachment; filename=lancamentos.csv");
    response.send(csv);
  }

  @Get("transactions.xlsx")
  async excel(
    @CurrentUser() user: JwtPayload,
    @Query() query: Record<string, string>,
    @Res() response: Response
  ) {
    const buffer = await this.exportsService.buildTransactionsExcel(user.sub, query);
    response.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    response.setHeader("Content-Disposition", "attachment; filename=lancamentos.xlsx");
    response.send(buffer);
  }
}
