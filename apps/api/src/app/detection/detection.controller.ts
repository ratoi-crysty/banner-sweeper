import { DetectionJob, DetectionSummary } from '@banner-sweeper/api-interfaces';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiExtraModels,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { GLOBAL_PREFIX } from '../configure-app';
import { DetectionJobEntity } from './detection-job.entity';
import { toDetectionJob, toDetectionSummary } from './detection-job.mapper';
import { DetectionService } from './detection.service';
import { CreateDetectionDto } from './dto/create-detection.dto';
import {
  DETECTION_JOB_MODELS,
  DETECTION_JOB_SCHEMA,
  DetectionSummaryDto,
} from './dto/detection-job.dto';

// Detection jobs don't fit a CRUD controller: creating one queues work, and the job is read-only after
@ApiTags('detections')
@ApiExtraModels(...DETECTION_JOB_MODELS)
@Controller('detections')
export class DetectionController {
  constructor(private readonly detections: DetectionService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Request a Detection',
    description:
      'Queues a Detection job for the URL. The `Location` header points to the job.',
  })
  @ApiAcceptedResponse({ type: DetectionSummaryDto })
  @ApiBadRequestResponse({ description: 'Invalid `url` or `hint`' })
  async create(
    @Body() body: CreateDetectionDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<DetectionSummary> {
    const job: DetectionJobEntity = await this.detections.create(body);
    response.location(`/${GLOBAL_PREFIX}/detections/${job.id}`);

    return toDetectionSummary(job);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get a Detection job',
    description:
      'The job envelope, plus `usage` and the result fields (discriminated on `outcome`) once it is finished.',
  })
  @ApiOkResponse({ schema: DETECTION_JOB_SCHEMA })
  @ApiNotFoundResponse({ description: 'No job with this id' })
  async findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<DetectionJob> {
    const job: DetectionJobEntity | null = await this.detections.findOne(id);

    if (!job) {
      throw new NotFoundException(`No Detection job ${id}`);
    }

    return toDetectionJob(job);
  }
}
