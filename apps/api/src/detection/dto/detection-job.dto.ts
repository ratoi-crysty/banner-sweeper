import type {
  CoveredResult,
  CoveredVia,
  DetectionErrorKind,
  DetectionJob,
  DetectionOutcome,
  DetectionPhase,
  DetectionResult,
  DetectionStatus,
  DetectionSummary,
  DetectionUsage,
  ErrorResult,
} from '@banner-sweeper/api-interfaces';
import { ApiExtraModels, ApiProperty, getSchemaPath } from '@nestjs/swagger';
import { VerificationReportDto } from './verification-report.dto';

const STATUSES: DetectionStatus[] = ['queued', 'running', 'finished'];
const PHASES: DetectionPhase[] = ['stockCheck', 'agent', 'finalVerification'];
const OUTCOMES: DetectionOutcome[] = [
  'drafted',
  'covered',
  'noBanner',
  'noRefusal',
  'error',
];
const ERROR_KINDS: DetectionErrorKind[] = [
  'siteUnreachable',
  'browserUnavailable',
  'llmFailure',
  'noSubmission',
  'timeout',
  'interrupted',
  'internal',
];
const COVERED_VIA: CoveredVia[] = ['stockCheck', 'inLoop'];

export class DetectionUsageDto implements DetectionUsage {
  @ApiProperty({ type: String, nullable: true })
  backend!: string | null;

  @ApiProperty({ type: String, nullable: true })
  model!: string | null;

  @ApiProperty({ type: String, nullable: true })
  effort!: string | null;

  @ApiProperty({ type: String, nullable: true })
  promptVersion!: string | null;

  @ApiProperty()
  turns!: number;

  @ApiProperty()
  inputTokens!: number;

  @ApiProperty()
  outputTokens!: number;

  @ApiProperty()
  cacheReadTokens!: number;

  @ApiProperty()
  cacheWriteTokens!: number;

  @ApiProperty({
    type: Number,
    nullable: true,
    description: '`null` when the backend has no pricing',
  })
  costUsd!: number | null;

  @ApiProperty()
  durationMs!: number;
}

export class CoveredResultDto implements CoveredResult {
  @ApiProperty({ enum: ['covered'] })
  outcome!: 'covered';

  @ApiProperty({ description: 'The Rule that Declined the banner' })
  coveredBy!: string;

  @ApiProperty({ type: VerificationReportDto })
  report!: VerificationReportDto;

  @ApiProperty({ enum: COVERED_VIA })
  via!: CoveredVia;
}

export class ErrorResultDto implements ErrorResult {
  @ApiProperty({ enum: ['error'] })
  outcome!: 'error';

  @ApiProperty({ enum: ERROR_KINDS })
  kind!: DetectionErrorKind;

  @ApiProperty()
  message!: string;
}

export class DetectionSummaryDto implements DetectionSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty({ enum: STATUSES })
  status!: DetectionStatus;

  @ApiProperty({ enum: OUTCOMES, nullable: true })
  outcome!: DetectionOutcome | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt!: string | null;
}

@ApiExtraModels(CoveredResultDto, ErrorResultDto)
export class DetectionJobDto implements DetectionJob {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  url!: string;

  @ApiProperty({ description: "The URL's hostname" })
  site!: string;

  @ApiProperty({ type: String, nullable: true })
  hint!: string | null;

  @ApiProperty({ enum: STATUSES })
  status!: DetectionStatus;

  @ApiProperty({
    enum: PHASES,
    nullable: true,
    description: 'Set only while the job is running',
  })
  phase!: DetectionPhase | null;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  startedAt!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  finishedAt!: string | null;

  @ApiProperty({
    type: DetectionUsageDto,
    nullable: true,
    description: 'Set once the job is finished',
  })
  usage!: DetectionUsageDto | null;

  @ApiProperty({
    nullable: true,
    description: 'Set once the job is finished, discriminated by `outcome`',
    oneOf: [
      { $ref: getSchemaPath(CoveredResultDto) },
      { $ref: getSchemaPath(ErrorResultDto) },
    ],
    discriminator: { propertyName: 'outcome' },
  })
  result!: DetectionResult | null;
}
