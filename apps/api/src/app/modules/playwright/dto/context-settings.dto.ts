import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';
import type { ContextSettings } from '../types';

export class ViewportDto {
  @ApiProperty({ type: 'integer', minimum: 1, maximum: 10000, example: 1280 })
  @IsInt()
  @Min(1)
  @Max(10000)
  width!: number;

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 10000, example: 800 })
  @IsInt()
  @Min(1)
  @Max(10000)
  height!: number;
}

/** Browser context to load the page in, e.g. to see what visitors from a given country see. */
export class ContextSettingsDto implements ContextSettings {
  @ApiPropertyOptional({ minLength: 1, description: 'Browser locale (Accept-Language, navigator.language).', example: 'ro-RO' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  locale?: string;

  @ApiPropertyOptional({ minLength: 1, description: 'IANA time zone.', example: 'Europe/Bucharest' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  timezoneId?: string;

  @ApiPropertyOptional({ minLength: 1, description: "Overrides the browser's user agent." })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  userAgent?: string;

  @ApiPropertyOptional({ type: (): typeof ViewportDto => ViewportDto })
  @IsOptional()
  @ValidateNested()
  @Type((): typeof ViewportDto => ViewportDto)
  viewport?: ViewportDto;
}
