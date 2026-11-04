import type {
  AutoconsentLogEntry,
  CheckResult,
  CheckStatus,
  FrameMessageLog,
  VerificationChecks,
  VerificationReport,
  VerificationTimings,
} from '@banner-sweeper/api-interfaces';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const CHECK_STATUSES: CheckStatus[] = ['passed', 'failed', 'skipped'];

export class CheckResultDto implements CheckResult {
  @ApiProperty({ enum: CHECK_STATUSES })
  status!: CheckStatus;

  @ApiProperty()
  reason!: string;
}

export class VerificationChecksDto implements VerificationChecks {
  @ApiProperty({ type: CheckResultDto, description: 'A Rule found the popup' })
  detected!: CheckResultDto;

  @ApiProperty({
    type: CheckResultDto,
    description: 'The Rule opted out and completed without a cosmetic hide',
  })
  declined!: CheckResultDto;
}

export class VerificationTimingsDto implements VerificationTimings {
  @ApiProperty()
  totalMs!: number;

  @ApiProperty({ type: Number, nullable: true })
  detectedMs!: number | null;

  @ApiProperty({ type: Number, nullable: true })
  declinedMs!: number | null;
}

export class AutoconsentLogEntryDto implements AutoconsentLogEntry {
  @ApiProperty({ description: 'Milliseconds since the run started' })
  atMs!: number;

  @ApiProperty({ description: 'The autoconsent message type' })
  type!: string;

  @ApiPropertyOptional()
  cmp?: string;

  @ApiPropertyOptional()
  result?: boolean;

  @ApiPropertyOptional()
  isCosmetic?: boolean;
}

export class FrameMessageLogDto implements FrameMessageLog {
  @ApiProperty()
  frameUrl!: string;

  @ApiProperty()
  mainFrame!: boolean;

  @ApiProperty({ type: [AutoconsentLogEntryDto] })
  messages!: AutoconsentLogEntryDto[];
}

export class VerificationReportDto implements VerificationReport {
  @ApiProperty({ type: VerificationChecksDto })
  checks!: VerificationChecksDto;

  @ApiProperty({ type: VerificationTimingsDto })
  timings!: VerificationTimingsDto;

  @ApiProperty({ type: [FrameMessageLogDto] })
  messageLog!: FrameMessageLogDto[];

  @ApiProperty({ type: String, nullable: true })
  popupFrameUrl!: string | null;
}
