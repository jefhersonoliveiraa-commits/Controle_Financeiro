import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { CategoriesService } from "./categories.service.js";
import { JwtAuthGuard } from "../auth/jwt.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { JwtPayload } from "../auth/auth.types.js";

@Controller("categories")
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  async create(@CurrentUser() user: JwtPayload, @Body() body: unknown) {
    return this.categoriesService.create(user.sub, body);
  }

  @Get()
  async list(@CurrentUser() user: JwtPayload) {
    return this.categoriesService.list(user.sub);
  }

  @Patch(":id")
  async update(@CurrentUser() user: JwtPayload, @Param("id") id: string, @Body() body: unknown) {
    return this.categoriesService.update(user.sub, id, body);
  }

  @Delete(":id")
  async remove(@CurrentUser() user: JwtPayload, @Param("id") id: string) {
    return this.categoriesService.remove(user.sub, id);
  }
}
