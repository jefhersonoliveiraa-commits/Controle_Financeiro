import { SignJWT, jwtVerify } from "jose";
import { getDb } from "./db";

const ACCESS_TOKEN_EXPIRES_IN = "15m";
const REFRESH_TOKEN_EXPIRES_DAYS = 30;

function getJwtSecret() {
  return new TextEncoder().encode(
    process.env.JWT_SECRET || "dev-secret-change"
  );
}

function getRefreshSecret() {
  return new TextEncoder().encode(
    process.env.JWT_REFRESH_SECRET || "dev-refresh-change"
  );
}

type JwtPayload = {
  sub: string;
  email: string;
  role: "USER" | "ADMIN";
};

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

export async function buildAuthResponse(userId: string): Promise<AuthResponse> {
  const sql = getDb();

  const users = await sql`
    SELECT "id", "name", "email", "role"
    FROM "User"
    WHERE "id" = ${userId}
  `;

  if (users.length === 0) {
    throw new Error("Usuario nao encontrado.");
  }

  const user = users[0];
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role as "USER" | "ADMIN",
  };

  const accessToken = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(ACCESS_TOKEN_EXPIRES_IN)
    .setIssuedAt()
    .sign(getJwtSecret());

  const refreshToken = await new SignJWT({ ...payload, typ: "refresh" })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${REFRESH_TOKEN_EXPIRES_DAYS}d`)
    .setIssuedAt()
    .sign(getRefreshSecret());

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

  await sql`
    INSERT INTO "RefreshToken" ("id", "token", "userId", "expiresAt", "createdAt")
    VALUES (gen_random_uuid(), ${refreshToken}, ${userId}, ${expiresAt.toISOString()}, NOW())
  `;

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role as "USER" | "ADMIN",
    },
  };
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret());
  return payload as unknown as JwtPayload;
}

export async function verifyRefreshToken(
  token: string
): Promise<JwtPayload & { typ?: string }> {
  const { payload } = await jwtVerify(token, getRefreshSecret());
  return payload as unknown as JwtPayload & { typ?: string };
}
