import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { buildAuthResponse } from "@/lib/auth-helpers";

const loginSchema = z.object({
  email: z.string().email("E-mail invalido."),
  password: z.string().min(6).max(100),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => e.message);
      return NextResponse.json({ message: messages.join(" | ") }, { status: 400 });
    }

    const { email, password } = parsed.data;
    const sql = getDb();

    const users = await sql`
      SELECT "id", "passwordHash" FROM "User" WHERE "email" = ${email} LIMIT 1
    `;

    if (users.length === 0) {
      return NextResponse.json({ message: "Credenciais invalidas." }, { status: 401 });
    }

    const user = users[0];
    const valid = await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
      return NextResponse.json({ message: "Credenciais invalidas." }, { status: 401 });
    }

    const authResponse = await buildAuthResponse(user.id);
    return NextResponse.json(authResponse);
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      { message: "Erro interno ao fazer login." },
      { status: 500 }
    );
  }
}
