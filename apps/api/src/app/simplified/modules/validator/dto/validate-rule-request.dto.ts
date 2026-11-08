import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { buildMessage, IsInt, IsOptional, Max, Min, ValidateBy, ValidateNested, type ValidationOptions } from 'class-validator';
import { IsHttpUrl } from '../../../common/validation';
import { ContextSettingsDto } from '../../playwright/dto/context-settings.dto';
import { AUTOCONSENT_RULE_SCHEMA } from '../../runner/dto/autoconsent-run-report.dto';
import type { AutoConsentCMPRule } from '../../runner/types';
import type { ValidateRuleRequest } from '../types';

/**
 * Shallow shape check only. The rule stays a plain object (no `@ValidateNested`), so the
 * global `whitelist` doesn't strip autoconsent fields this DTO doesn't declare;
 * autoconsent itself reports anything deeper when the rule runs.
 */
function isAutoconsentRule(value: unknown): value is AutoConsentCMPRule {
  if (typeof value !== 'object' || value === null) return false;
  const rule: Partial<Record<keyof AutoConsentCMPRule, unknown>> = value;
  return typeof rule.name === 'string' && rule.name.length > 0 && Array.isArray(rule.detectCmp);
}

function IsAutoconsentRule(validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isAutoconsentRule',
      validator: {
        validate: (value: unknown): boolean => isAutoconsentRule(value),
        defaultMessage: buildMessage(
          (): string => '$property must be an autoconsent rule object (name, detectCmp, detectPopup, optOut, optIn)',
          validationOptions,
        ),
      },
    },
    validationOptions,
  );
}

export class ValidateRuleRequestDto implements ValidateRuleRequest {
  @ApiProperty({ format: 'uri', description: 'Page to run the rule against.', example: 'https://example.com' })
  @IsHttpUrl()
  url!: string;

  @ApiProperty(AUTOCONSENT_RULE_SCHEMA)
  @IsAutoconsentRule()
  rule!: AutoConsentCMPRule;

  @ApiPropertyOptional({ type: 'integer', minimum: 1000, maximum: 300000, default: 25000, description: 'Total time budget, ms.' })
  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(300000)
  timeoutMs?: number;

  @ApiPropertyOptional({ type: (): typeof ContextSettingsDto => ContextSettingsDto })
  @IsOptional()
  @ValidateNested()
  @Type((): typeof ContextSettingsDto => ContextSettingsDto)
  context?: ContextSettingsDto;
}
