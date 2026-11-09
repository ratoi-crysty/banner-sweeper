import { ApiProperty } from '@nestjs/swagger';
import { AutoconsentRunReportDto } from '../../runner/dto/autoconsent-run-report.dto';
import type { SelectorCheck, ValidationResult } from '../types';

export class SelectorCheckDto implements SelectorCheck {
  @ApiProperty({ example: '#cookie-banner .reject-all' })
  selector!: string;

  @ApiProperty({ description: 'Where the selector is used in the rule.', example: 'optOut[0].waitForThenClick' })
  role!: string;

  @ApiProperty({ type: 'integer', description: 'Matches on the page.' })
  count!: number;

  @ApiProperty({ type: 'integer', description: 'Visible matches (up to 5 checked).' })
  visible!: number;
}

export class ValidationResultDto implements ValidationResult {
  @ApiProperty()
  passed!: boolean;

  @ApiProperty({ type: (): typeof AutoconsentRunReportDto => AutoconsentRunReportDto })
  report!: AutoconsentRunReportDto;

  @ApiProperty({
    type: Boolean,
    nullable: true,
    description: 'Banner still on screen after opt-out (checked independently of autoconsent).',
  })
  bannerVisibleAfter!: boolean | null;

  @ApiProperty({
    type: (): typeof SelectorCheckDto => SelectorCheckDto,
    isArray: true,
    description: 'Per-selector presence when the popup was found (or at the end if it never was).',
  })
  selectorChecks!: SelectorCheckDto[];

  @ApiProperty({ description: 'Human/LLM-readable explanation.' })
  feedback!: string;
}
