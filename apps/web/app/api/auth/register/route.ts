import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { buildAuthResponse } from "@/lib/auth-helpers";

const registerSchema = z.object({
  name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres."),
  email: z.string().email("E-mail invalido."),
  password: z.string().min(6, "Senha deve ter pelo menos 6 caracteres.").max(100),
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => e.message);
      return NextResponse.json({ message: messages.join(" | ") }, { status: 400 });
    }

    const { name, email, password } = parsed.data;
    const sql = getDb();

    const existing = await sql`
      SELECT "id" FROM "User" WHERE "email" = ${email} LIMIT 1
    `;

    if (existing.length > 0) {
      return NextResponse.json({ message: "E-mail ja cadastrado." }, { status: 401 });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const inserted = await sql`
      INSERT INTO "User" ("id", "name", "email", "passwordHash", "role", "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${name}, ${email}, ${passwordHash}, 'USER', NOW(), NOW())
      RETURNING "id"
    `;

    const userId = inserted[0].id;
    const authResponse = await buildAuthResponse(userId);

    return NextResponse.json(authResponse, { status: 201 });
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json(
      { message: "Erro interno ao criar conta." },
      { status: 500 }
    );
  }
}
