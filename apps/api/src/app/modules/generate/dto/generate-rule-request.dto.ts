import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';
import { IsHttpUrl } from '../../../shared/validation';
import { ProviderConfigDto } from '../../agent/dto/provider-config.dto';
import { ContextSettingsDto } from '../../playwright/dto/context-settings.dto';
import type { GenerateRuleRequest } from '../types';

export class GenerateRuleRequestDto implements GenerateRuleRequest {
  @ApiProperty({ format: 'uri', description: 'Page with the consent banner.', example: 'https://example.com' })
  @IsHttpUrl()
  url!: string;

  @ApiPropertyOptional({
    type: (): typeof ProviderConfigDto => ProviderConfigDto,
    description: "Model backend. Default: the server's LLM_PROVIDER / LLM_MODEL.",
  })
  @IsOptional()
  @ValidateNested()
  @Type((): typeof ProviderConfigDto => ProviderConfigDto)
  provider?: ProviderConfigDto;

  @ApiPropertyOptional({
    minLength: 1,
    pattern: '^(?!auto_)',
    description: 'Rule name. Default: `llm_<host>`. Must not start with `auto_` (reserved by autoconsent).',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^(?!auto_)/, { message: 'name must not start with "auto_" (reserved by autoconsent)' })
  name?: string;

  @ApiPropertyOptional({
    default: true,
    description: "First check whether autoconsent's bundled rules already handle the site.",
  })
  @IsOptional()
  @IsBoolean()
  checkBundledRules?: boolean;

  @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 50, default: 20, description: 'Max agent turns.' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxSteps?: number;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 0,
    maximum: 60000,
    default: 2500,
    description: 'Wait after page load before the agent looks, ms (banners often load late).',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60000)
  settleMs?: number;

  @ApiPropertyOptional({ type: (): typeof ContextSettingsDto => ContextSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type((): typeof ContextSettingsDto => ContextSettingsDto)
  context?: ContextSettingsDto;
}
