import { BadRequestException, PipeTransform } from "@nestjs/common";
import { ZodType } from "zod";

/**
 * Validates a request body against a zod schema, instead of class-validator
 * DTOs — so @ax/schema stays the single definition of the data model (see
 * CLAUDE.md / ADR-0004's sibling decision on the schema package).
 */
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return result.data;
  }
}
