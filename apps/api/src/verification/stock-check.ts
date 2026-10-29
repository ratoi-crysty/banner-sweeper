import { VerificationReport } from '@banner-sweeper/api-interfaces';

export interface StockCheckResult {
  // The Rule that Declined the banner, `null` when the Site isn't Covered
  coveredBy: string | null;
  // Why the Site isn't Covered, `null` when it is
  notCoveredReason: string | null;
  report: VerificationReport;
}

/**
 * Runs stock autoconsent (Bundled Rules plus Published Rules, the extension's exact config) on
 * a URL in a fresh browser context, and judges whether those Rules Decline its banner.
 */
export abstract class StockCheck {
  abstract run(url: string): Promise<StockCheckResult>;
}
