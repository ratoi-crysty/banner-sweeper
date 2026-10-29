import type { CreateDetectionRequest } from '@banner-sweeper/api-interfaces';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  MaxLength,
  ValidateBy,
  ValidationOptions,
} from 'class-validator';

const HTTP_PROTOCOLS: string[] = ['http:', 'https:'];

function isAbsoluteHttpUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !URL.canParse(value)) {
    return false;
  }

  return HTTP_PROTOCOLS.includes(new URL(value).protocol);
}

function IsAbsoluteHttpUrl(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isAbsoluteHttpUrl',
      validator: {
        validate: isAbsoluteHttpUrl,
        defaultMessage: (): string =>
          '$property must be an absolute http(s) URL',
      },
    },
    options,
  );
}

export class CreateDetectionDto implements CreateDetectionRequest {
  @ApiProperty({
    description:
      'The page to run Detection on, absolute http(s). Stored as given.',
    maxLength: 2048,
    example: 'https://www.example.org/',
  })
  @IsString()
  @MaxLength(2048)
  @IsAbsoluteHttpUrl()
  url!: string;

  @ApiPropertyOptional({
    description:
      'Guidance from the requesting Member about where or how the Consent Banner appears.',
    maxLength: 2000,
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  hint?: string;
}
