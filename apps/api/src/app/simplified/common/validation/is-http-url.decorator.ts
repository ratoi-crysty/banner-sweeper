import { buildMessage, ValidateBy, type ValidationOptions } from 'class-validator';

export const IS_HTTP_URL = 'isHttpUrl';

/** Absolute http(s) URL as parsed by WHATWG `URL` (unlike `@IsUrl()`, accepts `localhost` and ports without a TLD). */
export function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return /^https?:$/.test(new URL(value).protocol);
  } catch {
    return false;
  }
}

export function IsHttpUrl(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: IS_HTTP_URL,
      validator: {
        validate: (value: unknown): boolean => isHttpUrl(value),
        defaultMessage: buildMessage(
          (eachPrefix: string): string => `${eachPrefix}$property must be an absolute http(s) URL`,
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}
