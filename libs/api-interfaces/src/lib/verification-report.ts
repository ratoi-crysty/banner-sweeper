export type CheckStatus = 'passed' | 'failed' | 'skipped';

export interface CheckResult {
  status: CheckStatus;
  reason: string;
}

/**
 * The checks a Verification ran. The stock check judges Covered on `detected` and `declined`
 * for now; the remaining checks join as they are built.
 */
export interface VerificationChecks {
  detected: CheckResult;
  declined: CheckResult;
}

/** One autoconsent message, as the run received it. */
export interface AutoconsentLogEntry {
  // Milliseconds since the run started
  atMs: number;
  type: string;
  cmp?: string;
  result?: boolean;
  isCosmetic?: boolean;
}

export interface FrameMessageLog {
  frameUrl: string;
  mainFrame: boolean;
  messages: AutoconsentLogEntry[];
}

export interface VerificationTimings {
  totalMs: number;
  // From the start of the run to `popupFound`, `null` when nothing was found
  detectedMs: number | null;
  // From the start of the run to a non-cosmetic `autoconsentDone`, `null` when it never came
  declinedMs: number | null;
}

/** The evidence a Verification produces. */
export interface VerificationReport {
  checks: VerificationChecks;
  timings: VerificationTimings;
  messageLog: FrameMessageLog[];
  // The URL of the frame the popup was found in, `null` when none was
  popupFrameUrl: string | null;
}
