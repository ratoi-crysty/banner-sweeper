import { VerificationReport } from '@banner-sweeper/api-interfaces';

export interface CoveredStockCheck {
  covered: true;
  // The Rule that Declined the banner
  coveredBy: string;
  report: VerificationReport;
}

export interface NotCoveredStockCheck {
  covered: false;
  notCoveredReason: string;
  report: VerificationReport;
}

export type StockCheckResult = CoveredStockCheck | NotCoveredStockCheck;

/**
 * Runs stock autoconsent (Bundled Rules plus Published Rules, the extension's exact config) on
 * a URL in a fresh browser context, and judges whether those Rules Decline its banner.
 */
export abstract class StockCheck {
  abstract run(url: string): Promise<StockCheckResult>;
}
