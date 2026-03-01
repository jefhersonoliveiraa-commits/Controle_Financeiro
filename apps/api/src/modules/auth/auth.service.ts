import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { REFRESH_TOKEN_EXPIRES_DAYS } from "../../config/constants.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import type { JwtPayload } from "./auth.types.js";
import { addDays } from "date-fns";
import bcrypt from "bcryptjs";

type AuthResponse = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: "USER" | "ADMIN";
  };
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async register(input: { name: string; email: string; password: string }): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) {
      throw new UnauthorizedException("E-mail ja cadastrado.");
    }

    const user = await this.prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 10),
        role: "USER"
      }
    });

    return this.buildAuthResponse(user.id);
  }

  async login(input: { email: string; password: string }): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      throw new UnauthorizedException("Credenciais invalidas.");
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Credenciais invalidas.");
    }

    return this.buildAuthResponse(user.id);
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const refreshSecret = this.configService.get<string>("JWT_REFRESH_SECRET", "dev-refresh-change");
    let payload: (JwtPayload & { typ?: string }) | null = null;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload & { typ?: string }>(refreshToken, {
        secret: refreshSecret
      });
    } catch {
      throw new UnauthorizedException("Refresh token invalido.");
    }
    if (payload.typ !== "refresh") {
      throw new UnauthorizedException("Refresh token invalido.");
    }

    const existing = await this.prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token invalido.");
    }
    if (existing.userId !== payload.sub) {
      throw new UnauthorizedException("Refresh token invalido.");
    }

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date() }
    });

    return this.buildAuthResponse(existing.userId);
  }

  async profile(userId: string): Promise<{ id: string; name: string; email: string; role: "USER" | "ADMIN" }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException("Usuario nao encontrado.");
    }

    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }

  private async buildAuthResponse(userId: string): Promise<AuthResponse> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const payload: JwtPayload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.jwtService.signAsync(
      { ...payload, typ: "refresh" },
      {
        expiresIn: `${REFRESH_TOKEN_EXPIRES_DAYS}d`,
        secret: this.configService.get<string>("JWT_REFRESH_SECRET", "dev-refresh-change")
      }
    );

    await this.prisma.refreshToken.create({
      data: {
        token: refreshToken,
        userId: user.id,
        expiresAt: addDays(new Date(), REFRESH_TOKEN_EXPIRES_DAYS)
      }
    });

    return {
      accessToken,
      refreshToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    };
  }
}
