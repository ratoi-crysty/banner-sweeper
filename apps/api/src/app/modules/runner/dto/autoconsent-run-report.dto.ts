import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { AutoconsentRunReport } from '../types';

/** OpenAPI schema for an autoconsent rule. Too polymorphic to model field by field; autoconsent validates it when it runs. */
export const AUTOCONSENT_RULE_SCHEMA = {
  type: 'object',
  additionalProperties: true,
  description:
    'An @duckduckgo/autoconsent rule (AutoConsentCMPRule). Requires `name` and a `detectCmp` array; ' +
    'usually also has `prehideSelectors`, `detectPopup`, `optOut` and `optIn`.',
  example: {
    name: 'llm_example.com',
    runContext: { urlPattern: '^https?://(www\\.)?example\\.com/' },
    prehideSelectors: ['#cookie-banner'],
    detectCmp: [{ exists: '#cookie-banner' }],
    detectPopup: [{ visible: '#cookie-banner' }],
    optOut: [{ waitForThenClick: '#cookie-banner .reject-all' }],
    optIn: [{ waitForThenClick: '#cookie-banner .accept-all' }],
  },
} as const;

export class AutoconsentRunReportDto implements AutoconsentRunReport {
  @ApiProperty({ type: String, nullable: true, description: 'Name of the CMP rule autoconsent matched.' })
  cmpDetected!: string | null;

  @ApiProperty()
  popupFound!: boolean;

  @ApiProperty({ type: Boolean, nullable: true })
  optOutResult!: boolean | null;

  @ApiProperty({ type: Boolean, nullable: true })
  selfTestResult!: boolean | null;

  @ApiProperty()
  done!: boolean;

  @ApiProperty({ type: [String] })
  errors!: string[];

  @ApiProperty({ type: [String], description: 'autoconsent message types in the order received.' })
  timeline!: string[];

  @ApiPropertyOptional({ description: 'Set when the site served an error or bot-challenge page instead of the real one.' })
  blocked?: string;
}
