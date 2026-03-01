import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { JwtPayload } from "../auth/auth.types.js";
import { JwtAuthGuard } from "../auth/jwt.guard.js";
import { ImportsService } from "./imports.service.js";

@Controller("imports")
@UseGuards(JwtAuthGuard)
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post("transactions/preview")
  async preview(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.importsService.previewTransactions(user.sub, body);
  }

  @Post("transactions/commit")
  async commit(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.importsService.commitTransactions(user.sub, body);
  }
}

