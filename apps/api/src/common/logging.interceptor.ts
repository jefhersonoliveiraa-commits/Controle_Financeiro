import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor
} from "@nestjs/common";
import { Observable, tap } from "rxjs";
import type { Request, Response } from "express";
import { performance } from "node:perf_hooks";

type RequestWithUser = Request & {
  user?: { sub: string; role: "USER" | "ADMIN" };
};

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = performance.now();

    return next.handle().pipe(
      tap(() => {
        const elapsedMs = Number((performance.now() - startedAt).toFixed(1));
        this.logger.log(
          JSON.stringify({
            level: "info",
            method: request.method,
            path: request.url,
            statusCode: response.statusCode,
            elapsedMs,
            userId: request.user?.sub ?? null
          })
        );
      })
    );
  }
}
