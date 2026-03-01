import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { HttpExceptionFilter } from "./common/http-exception.filter.js";
import { LoggingInterceptor } from "./common/logging.interceptor.js";
import { AppModule } from "./app.module.js";

function isPrivateNetworkHostname(hostname: string) {
  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1") {
    return true;
  }
  if (normalized.startsWith("10.")) {
    return true;
  }
  if (normalized.startsWith("192.168.")) {
    return true;
  }
  if (normalized.startsWith("172.")) {
    const second = Number(normalized.split(".")[1] ?? "0");
    return second >= 16 && second <= 31;
  }
  return false;
}

function isAllowedPrivateOrigin(origin: string) {
  try {
    const url = new URL(origin);
    return url.port === "3000" && isPrivateNetworkHostname(url.hostname);
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const allowPrivateNetworkOrigins =
    (process.env.CORS_ALLOW_PRIVATE_NETWORK ??
      (process.env.NODE_ENV === "production" ? "false" : "true")) === "true";

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (error: Error | null, allow?: boolean) => void
    ) => {
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        (allowPrivateNetworkOrigins && isAllowedPrivateOrigin(origin))
      ) {
        callback(null, true);
        return;
      }
      callback(new Error("CORS origin nao permitido."));
    },
    methods: ["GET", "POST", "PATCH", "DELETE", "PUT"],
    credentials: true
  });
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  const port = process.env.PORT ? Number(process.env.PORT) : 3333;
  await app.listen(port);

  const logger = new Logger("Bootstrap");
  logger.log(JSON.stringify({ level: "info", message: "API online", port }));
}

bootstrap();
