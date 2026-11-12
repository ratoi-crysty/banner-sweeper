import { Body, Controller, Delete, Get, HttpCode, MessageEvent, Param, ParseUUIDPipe, Post, Sse } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { map, type Observable } from 'rxjs';
import { ErrorResponseDto } from '../../shared/dto';
import { GenerateRuleRequestDto } from './dto/generate-rule-request.dto';
import { GENERATE_RULE_RESULT_MODELS } from './dto/generate-rule-result.dto';
import { GENERATION_EVENT_MODELS, GENERATION_EVENT_SCHEMA } from './dto/generation-event.dto';
import { CreateGenerationJobResponseDto, GenerationJobDto } from './dto/generation-job.dto';
import { GenerationJobsService } from './generation-jobs.service';
import type { CreateGenerationJobResponse, GenerationJob } from './types/generate.types';

const JOB_ID_PARAM = { name: 'id', format: 'uuid', description: 'Job id from `POST /rules/generate`.' } as const;

/** Applies to every route that takes a job id. */
const INVALID_JOB_ID = { type: ErrorResponseDto, description: 'The id is not a UUID.' };

@ApiTags('generate')
@ApiExtraModels(...GENERATE_RULE_RESULT_MODELS, ...GENERATION_EVENT_MODELS)
@Controller('rules/generate')
export class GenerateController {
  constructor(private readonly jobs: GenerationJobsService) {}

  @Post()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Start a rule generation job',
    description:
      'An agent drives a real browser to find the consent banner and its reject path, then writes an autoconsent rule ' +
      'and validates it. This takes minutes, so the job runs in the background: poll `GET /rules/generate/{id}` or ' +
      'subscribe to `GET /rules/generate/{id}/events`. Up to MAX_CONCURRENT_JOBS jobs run at once; the rest wait as `queued`.',
  })
  @ApiAcceptedResponse({ type: CreateGenerationJobResponseDto, description: 'Job created.' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Invalid request body.' })
  create(@Body() body: GenerateRuleRequestDto): CreateGenerationJobResponse {
    const job = this.jobs.create(body);
    return { id: job.id, state: job.state };
  }

  @Get()
  @ApiOperation({
    summary: 'List generation jobs',
    description: 'Newest first. Only the most recent finished jobs are kept in memory, and none survive a restart.',
  })
  @ApiOkResponse({ type: GenerationJobDto, isArray: true })
  list(): GenerationJob[] {
    return this.jobs.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a generation job' })
  @ApiParam(JOB_ID_PARAM)
  @ApiBadRequestResponse(INVALID_JOB_ID)
  @ApiOkResponse({ type: GenerationJobDto })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'No such job (or it was evicted).' })
  get(@Param('id', ParseUUIDPipe) id: string): GenerationJob {
    return this.jobs.get(id);
  }

  @Sse(':id/events')
  @ApiOperation({
    summary: 'Stream a generation job’s progress',
    description:
      'Server-sent events. Replays everything that has happened so far, then streams live until the job ends. ' +
      'Each SSE `event` name equals the payload’s `type` (`state`, `log`, `step`, `result`, `error`); `data` is the JSON payload.',
  })
  @ApiParam(JOB_ID_PARAM)
  @ApiBadRequestResponse(INVALID_JOB_ID)
  @ApiProduces('text/event-stream')
  @ApiOkResponse({
    description: 'Stream of `GenerationEvent` payloads; closes when the job finishes or fails.',
    content: { 'text/event-stream': { schema: GENERATION_EVENT_SCHEMA } },
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'No such job (or it was evicted).' })
  events(@Param('id', ParseUUIDPipe) id: string): Observable<MessageEvent> {
    return this.jobs.events(id).pipe(map((event) => ({ type: event.type, data: event })));
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Cancel a generation job',
    description:
      'A queued job finishes immediately with `result.status` = `cancelled`. A running job is asked to stop and finishes ' +
      'shortly after with whatever steps it took. Cancelling a finished job does nothing.',
  })
  @ApiParam(JOB_ID_PARAM)
  @ApiBadRequestResponse(INVALID_JOB_ID)
  @ApiOkResponse({ type: GenerationJobDto, description: 'The job as it is right after the cancel request.' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'No such job (or it was evicted).' })
  cancel(@Param('id', ParseUUIDPipe) id: string): GenerationJob {
    return this.jobs.cancel(id);
  }
}
