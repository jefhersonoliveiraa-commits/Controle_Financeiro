import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { validateWithZod } from "../../common/zod.js";
import { AuthService } from "./auth.service.js";
import { JwtAuthGuard } from "./jwt.guard.js";

const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6).max(100)
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(100)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20)
});

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  async register(@Body() body: unknown) {
    return this.authService.register(validateWithZod(registerSchema, body));
  }

  @Post("login")
  async login(@Body() body: unknown) {
    return this.authService.login(validateWithZod(loginSchema, body));
  }

  @Post("refresh")
  async refresh(@Body() body: unknown) {
    const parsed = validateWithZod(refreshSchema, body);
    return this.authService.refresh(parsed.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get("profile")
  async profile(
    @Req() request: { user: { sub: string } }
  ): Promise<{ id: string; name: string; email: string; role: "USER" | "ADMIN" }> {
    return this.authService.profile(request.user.sub);
  }
}
