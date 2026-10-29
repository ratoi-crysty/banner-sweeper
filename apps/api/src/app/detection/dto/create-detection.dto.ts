import type { CreateDetectionRequest } from '@banner-sweeper/api-interfaces';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, Validate } from 'class-validator';
import { IsAbsoluteHttpUrlConstraint } from './is-absolute-http-url.constraint';

export class CreateDetectionDto implements CreateDetectionRequest {
  @ApiProperty({
    description:
      'The page to run Detection on, absolute http(s). Stored as given.',
    maxLength: 2048,
    example: 'https://www.example.org/',
  })
  @IsString()
  @MaxLength(2048)
  @Validate(IsAbsoluteHttpUrlConstraint)
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
