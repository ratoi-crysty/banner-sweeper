import { ValidationArguments, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

/** Rejects backend entries that share an id. Apply with `@Validate(UniqueBackendIdsConstraint)`. */
@ValidatorConstraint({ name: 'uniqueBackendIds' })
export class UniqueBackendIdsConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return this.duplicateIds(value).length === 0;
  }

  defaultMessage(validationArguments: ValidationArguments): string {
    return `$property has duplicate ids: ${this.duplicateIds(validationArguments.value).join(', ')}`;
  }

  // Entries without a string id are left to the entry's own checks
  protected duplicateIds(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const ids: unknown[] = value.map((entry: unknown): unknown =>
      typeof entry === 'object' && entry !== null ? Reflect.get(entry, 'id') : undefined,
    );

    return ids.filter(
      (id: unknown, index: number): id is string => typeof id === 'string' && ids.indexOf(id) !== index,
    );
  }
}
