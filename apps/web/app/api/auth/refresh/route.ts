import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { buildAuthResponse, verifyRefreshToken } from "@/lib/auth-helpers";

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = refreshSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ message: "Refresh token invalido." }, { status: 401 });
    }

    const { refreshToken } = parsed.data;

    let payload: Awaited<ReturnType<typeof verifyRefreshToken>>;
    try {
      payload = await verifyRefreshToken(refreshToken);
    } catch {
      return NextResponse.json({ message: "Refresh token invalido." }, { status: 401 });
    }

    if (payload.typ !== "refresh") {
      return NextResponse.json({ message: "Refresh token invalido." }, { status: 401 });
    }

    const sql = getDb();

    const tokens = await sql`
      SELECT "id", "userId", "revokedAt", "expiresAt"
      FROM "RefreshToken"
      WHERE "token" = ${refreshToken}
      LIMIT 1
    `;

    if (tokens.length === 0) {
      return NextResponse.json({ message: "Refresh token invalido." }, { status: 401 });
    }

    const existing = tokens[0];

    if (existing.revokedAt || new Date(existing.expiresAt) < new Date()) {
      return NextResponse.json({ message: "Refresh token invalido." }, { status: 401 });
    }

    if (existing.userId !== payload.sub) {
      return NextResponse.json({ message: "Refresh token invalido." }, { status: 401 });
    }

    await sql`
      UPDATE "RefreshToken"
      SET "revokedAt" = NOW()
      WHERE "id" = ${existing.id}
    `;

    const authResponse = await buildAuthResponse(existing.userId);
    return NextResponse.json(authResponse);
  } catch (error) {
    console.error("Refresh error:", error);
    return NextResponse.json(
      { message: "Erro interno ao atualizar token." },
      { status: 500 }
    );
  }
}
