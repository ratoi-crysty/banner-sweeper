import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AgentStepDto } from '../../agent/dto/agent-step.dto';
import type {
  CreateGenerationJobResponse,
  GenerateRuleResult,
  GenerationJob,
  GenerationJobState,
} from '../types/generate.types';
import { GenerateRuleRequestDto } from './generate-rule-request.dto';
import { GENERATE_RULE_RESULT_SCHEMA } from './generate-rule-result.dto';

export const GENERATION_JOB_STATES: GenerationJobState[] = ['queued', 'running', 'finished', 'error'];

const STATE_DESCRIPTION: string =
  '`queued` → `running` → `finished` (see `result`) or `error` (see `error`). ' +
  'A cancelled job ends `finished` with `result.status` = `cancelled`.';

export class CreateGenerationJobResponseDto implements CreateGenerationJobResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: GENERATION_JOB_STATES, enumName: 'GenerationJobState', description: STATE_DESCRIPTION })
  state!: GenerationJobState;
}

export class GenerationJobDto implements GenerationJob {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: GENERATION_JOB_STATES, enumName: 'GenerationJobState', description: STATE_DESCRIPTION })
  state!: GenerationJobState;

  @ApiProperty({ type: (): typeof GenerateRuleRequestDto => GenerateRuleRequestDto })
  request!: GenerateRuleRequestDto;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({ format: 'date-time' })
  startedAt?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  finishedAt?: string;

  @ApiProperty({
    type: (): typeof AgentStepDto => AgentStepDto,
    isArray: true,
    description: 'Agent tool calls so far. Screenshots are omitted.',
  })
  steps!: AgentStepDto[];

  @ApiProperty({ type: [String], description: 'Progress messages so far.' })
  logs!: string[];

  @ApiPropertyOptional({ ...GENERATE_RULE_RESULT_SCHEMA, description: 'Set when `state` is `finished`.' })
  result?: GenerateRuleResult;

  @ApiPropertyOptional({ description: 'Set when `state` is `error`.' })
  error?: string;
}
