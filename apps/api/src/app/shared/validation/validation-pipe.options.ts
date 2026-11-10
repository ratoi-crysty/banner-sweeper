import type { ValidationPipeOptions } from '@nestjs/common';

/** Global ValidationPipe config: unknown fields are rejected (not silently dropped), payloads become DTO instances. */
export const VALIDATION_PIPE_OPTIONS: ValidationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
};
