import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const HTTP_PROTOCOLS: string[] = ['http:', 'https:'];

/** Accepts only absolute http(s) URLs. Apply with `@Validate(IsAbsoluteHttpUrlConstraint)`. */
@ValidatorConstraint({ name: 'isAbsoluteHttpUrl' })
export class IsAbsoluteHttpUrlConstraint
  implements ValidatorConstraintInterface
{
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !URL.canParse(value)) {
      return false;
    }

    return HTTP_PROTOCOLS.includes(new URL(value).protocol);
  }

  defaultMessage(): string {
    return '$property must be an absolute http(s) URL';
  }
}
