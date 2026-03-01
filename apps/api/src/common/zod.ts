import { BadRequestException } from "@nestjs/common";
import { z } from "zod";

export function validateWithZod<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown
): z.output<TSchema> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.flatten());
  }
  return parsed.data;
}
