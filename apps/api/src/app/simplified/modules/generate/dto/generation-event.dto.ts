import { ApiProperty, getSchemaPath, type ReferenceObject } from '@nestjs/swagger';
import { AgentStepDto } from '../../agent/dto/agent-step.dto';
import type { GenerateRuleResult, GenerationEvent, GenerationJobState } from '../types';
import { GENERATE_RULE_RESULT_SCHEMA, type DiscriminatedUnionSchema } from './generate-rule-result.dto';
import { GENERATION_JOB_STATES } from './generation-job.dto';

type EventOf<T extends GenerationEvent['type']> = Extract<GenerationEvent, { type: T }>;

export class GenerationStateEventDto implements EventOf<'state'> {
  @ApiProperty({ enum: ['state'] })
  type!: 'state';

  @ApiProperty({ enum: GENERATION_JOB_STATES, enumName: 'GenerationJobState' })
  state!: GenerationJobState;
}

export class GenerationLogEventDto implements EventOf<'log'> {
  @ApiProperty({ enum: ['log'] })
  type!: 'log';

  @ApiProperty()
  message!: string;
}

export class GenerationStepEventDto implements EventOf<'step'> {
  @ApiProperty({ enum: ['step'] })
  type!: 'step';

  @ApiProperty({ type: (): typeof AgentStepDto => AgentStepDto })
  step!: AgentStepDto;
}

export class GenerationResultEventDto implements EventOf<'result'> {
  @ApiProperty({ enum: ['result'] })
  type!: 'result';

  @ApiProperty(GENERATE_RULE_RESULT_SCHEMA)
  result!: GenerateRuleResult;
}

export class GenerationErrorEventDto implements EventOf<'error'> {
  @ApiProperty({ enum: ['error'] })
  type!: 'error';

  @ApiProperty()
  error!: string;
}

export const GENERATION_EVENT_MODELS = [
  GenerationStateEventDto,
  GenerationLogEventDto,
  GenerationStepEventDto,
  GenerationResultEventDto,
  GenerationErrorEventDto,
];

/** `GenerationEvent` (the SSE `data` payload) as a discriminated union on `type`. */
export const GENERATION_EVENT_SCHEMA: DiscriminatedUnionSchema = {
  oneOf: GENERATION_EVENT_MODELS.map((model): ReferenceObject => ({ $ref: getSchemaPath(model) })),
  discriminator: {
    propertyName: 'type',
    mapping: {
      state: getSchemaPath(GenerationStateEventDto),
      log: getSchemaPath(GenerationLogEventDto),
      step: getSchemaPath(GenerationStepEventDto),
      result: getSchemaPath(GenerationResultEventDto),
      error: getSchemaPath(GenerationErrorEventDto),
    },
  },
};
