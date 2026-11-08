import { ApiProperty, ApiPropertyOptional, getSchemaPath, type DiscriminatorObject, type ReferenceObject } from '@nestjs/swagger';
import { AgentStepDto } from '../../agent/dto/agent-step.dto';
import { AUTOCONSENT_RULE_SCHEMA } from '../../runner/dto/autoconsent-run-report.dto';
import type { AutoConsentCMPRule } from '../../runner/types';
import { ValidationResultDto } from '../../validator/dto/validation-result.dto';
import type { GenerateRuleResult } from '../types';

type GeneratedResult = Extract<GenerateRuleResult, { status: 'generated' }>;
type CoveredResult = Extract<GenerateRuleResult, { status: 'covered-by-bundled-rule' }>;
type UnresolvedResult = Extract<GenerateRuleResult, { status: 'blocked' | 'no-banner' | 'failed' | 'cancelled' }>;
type UnresolvedStatus = UnresolvedResult['status'];

/** A `oneOf` + `discriminator` schema; narrow enough for both `@ApiProperty()` and a response `content` schema. */
export interface DiscriminatedUnionSchema {
  oneOf: ReferenceObject[];
  discriminator: DiscriminatorObject;
}

const UNRESOLVED_STATUSES: UnresolvedStatus[] = ['blocked', 'no-banner', 'failed', 'cancelled'];

export class GeneratedRuleResultDto implements GeneratedResult {
  @ApiProperty({ enum: ['generated'], description: 'A new rule was written and passed validation.' })
  status!: 'generated';

  @ApiProperty(AUTOCONSENT_RULE_SCHEMA)
  rule!: AutoConsentCMPRule;

  @ApiProperty({ type: (): typeof ValidationResultDto => ValidationResultDto })
  validation!: ValidationResultDto;

  @ApiProperty()
  summary!: string;

  @ApiProperty({ type: (): typeof AgentStepDto => AgentStepDto, isArray: true })
  steps!: AgentStepDto[];
}

export class CoveredByBundledRuleResultDto implements CoveredResult {
  @ApiProperty({
    enum: ['covered-by-bundled-rule'],
    description: "autoconsent's bundled rules already handle the site; no rule was generated.",
  })
  status!: 'covered-by-bundled-rule';

  @ApiProperty({ description: 'Name of the bundled rule that matched.', example: 'onetrust' })
  cmp!: string;

  @ApiProperty()
  summary!: string;

  @ApiProperty({ type: (): typeof AgentStepDto => AgentStepDto, isArray: true })
  steps!: AgentStepDto[];
}

export class UnresolvedRuleResultDto implements UnresolvedResult {
  @ApiProperty({
    enum: UNRESOLVED_STATUSES,
    description:
      '`blocked`: the site served an error or bot-challenge page. `no-banner`: no consent banner was found. ' +
      '`failed`: the agent gave up or no candidate rule passed. `cancelled`: the job was cancelled.',
  })
  status!: UnresolvedStatus;

  @ApiProperty()
  summary!: string;

  @ApiProperty({ type: (): typeof AgentStepDto => AgentStepDto, isArray: true })
  steps!: AgentStepDto[];

  @ApiPropertyOptional({ ...AUTOCONSENT_RULE_SCHEMA, description: 'The last rule tried, if any.' })
  rule?: AutoConsentCMPRule;

  @ApiPropertyOptional({
    type: (): typeof ValidationResultDto => ValidationResultDto,
    description: "The last rule's validation, if any.",
  })
  validation?: ValidationResultDto;
}

export const GENERATE_RULE_RESULT_MODELS = [GeneratedRuleResultDto, CoveredByBundledRuleResultDto, UnresolvedRuleResultDto];

/** `GenerateRuleResult` as a discriminated union on `status`. Register the models with `@ApiExtraModels(...GENERATE_RULE_RESULT_MODELS)`. */
export const GENERATE_RULE_RESULT_SCHEMA: DiscriminatedUnionSchema = {
  oneOf: GENERATE_RULE_RESULT_MODELS.map((model): ReferenceObject => ({ $ref: getSchemaPath(model) })),
  discriminator: {
    propertyName: 'status',
    mapping: {
      generated: getSchemaPath(GeneratedRuleResultDto),
      'covered-by-bundled-rule': getSchemaPath(CoveredByBundledRuleResultDto),
      ...Object.fromEntries(UNRESOLVED_STATUSES.map((status): [string, string] => [status, getSchemaPath(UnresolvedRuleResultDto)])),
    },
  },
};
