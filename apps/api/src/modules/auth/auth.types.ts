export type JwtPayload = {
  sub: string;
  role: "USER" | "ADMIN";
  email: string;
};
