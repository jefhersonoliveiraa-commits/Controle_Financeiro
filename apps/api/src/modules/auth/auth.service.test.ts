import assert from "node:assert/strict";
import test from "node:test";
import { AuthService } from "./auth.service.js";

test("AuthService.refresh rotates refresh token and revokes previous one", async () => {
  const now = new Date();
  let revokedTokenId: string | null = null;

  const prisma = {
    user: {
      findUnique: async () => null,
      findUniqueOrThrow: async () => ({
        id: "user-1",
        name: "Demo",
        email: "demo@financeiro.app",
        role: "USER"
      })
    },
    refreshToken: {
      findUnique: async () => ({
        id: "old-token-id",
        token: "old-refresh-token",
        userId: "user-1",
        expiresAt: new Date(now.getTime() + 60_000),
        revokedAt: null
      }),
      update: async (input: { where: { id: string } }) => {
        revokedTokenId = input.where.id;
        return {};
      },
      create: async () => ({ id: "new-token-id" })
    }
  };

  const jwtService = {
    verifyAsync: async () => ({ sub: "user-1", email: "demo@financeiro.app", role: "USER", typ: "refresh" }),
    signAsync: async (payload: { typ?: string }) =>
      payload.typ === "refresh" ? "new-refresh-token" : "new-access-token"
  };

  const configService = {
    get: (_key: string, fallback: string) => fallback
  };

  const service = new AuthService(
    prisma as never,
    jwtService as never,
    configService as never
  );

  const result = await service.refresh("old-refresh-token");

  assert.equal(revokedTokenId, "old-token-id");
  assert.equal(result.accessToken, "new-access-token");
  assert.equal(result.refreshToken, "new-refresh-token");
  assert.equal(result.user.id, "user-1");
});

