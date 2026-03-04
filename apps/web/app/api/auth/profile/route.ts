import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { verifyAccessToken } from "@/lib/auth-helpers";

export async function GET(request: Request) {
  try {
    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return NextResponse.json({ message: "Token nao fornecido." }, { status: 401 });
    }

    const token = authorization.slice(7);

    let payload: Awaited<ReturnType<typeof verifyAccessToken>>;
    try {
      payload = await verifyAccessToken(token);
    } catch {
      return NextResponse.json({ message: "Token invalido." }, { status: 401 });
    }

    const sql = getDb();

    const users = await sql`
      SELECT "id", "name", "email", "role"
      FROM "User"
      WHERE "id" = ${payload.sub}
      LIMIT 1
    `;

    if (users.length === 0) {
      return NextResponse.json({ message: "Usuario nao encontrado." }, { status: 401 });
    }

    const user = users[0];
    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } catch (error) {
    console.error("Profile error:", error);
    return NextResponse.json(
      { message: "Erro interno ao buscar perfil." },
      { status: 500 }
    );
  }
}
