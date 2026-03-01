import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AccountsService } from "./accounts.service.js";
import { JwtAuthGuard } from "../auth/jwt.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { JwtPayload } from "../auth/auth.types.js";

@Controller("accounts")
@UseGuards(JwtAuthGuard)
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  async create(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.accountsService.create(user.sub, body);
  }

  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    return this.accountsService.list(user.sub);
  }

  @Get(":id")
  async byId(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.accountsService.getById(user.sub, id);
  }

  @Patch(":id")
  async update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() body: unknown) {
    return this.accountsService.update(user.sub, id, body);
  }

  @Delete(":id")
  async remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.accountsService.remove(user.sub, id);
  }
}
