import { DetectionUsage } from './usage.js';
import { VerificationReport } from './verification-report.js';

export interface CreateDetectionRequest {
  // Absolute http(s), at most 2048 characters, stored as given
  url: string;
  // Guidance from the requesting Member, at most 2000 characters
  hint?: string;
}

export type DetectionStatus = 'queued' | 'running' | 'finished';

export type DetectionPhase = 'stockCheck' | 'agent' | 'finalVerification';

export type DetectionOutcome =
  | 'drafted'
  | 'covered'
  | 'noBanner'
  | 'noRefusal'
  | 'error';

export type DetectionErrorKind =
  | 'siteUnreachable'
  | 'browserUnavailable'
  | 'llmFailure'
  | 'noSubmission'
  | 'timeout'
  | 'interrupted'
  | 'internal';

export type CoveredVia = 'stockCheck' | 'inLoop';

/** Existing Rules (Bundled or Published) already Decline the Site's banner. */
export interface CoveredResult {
  outcome: 'covered';
  // The name of the Rule that Declined the banner
  coveredBy: string;
  report: VerificationReport;
  via: CoveredVia;
}

export interface ErrorResult {
  outcome: 'error';
  kind: DetectionErrorKind;
  message: string;
}

// `drafted`, `noBanner` and `noRefusal` join with the agent
export type DetectionResult = CoveredResult | ErrorResult;

export interface DetectionSummary {
  id: string;
  url: string;
  status: DetectionStatus;
  outcome: DetectionOutcome | null;
  // ISO 8601 timestamps
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** A Detection job's own fields, whatever its outcome. */
export interface DetectionEnvelope {
  id: string;
  url: string;
  site: string;
  hint: string | null;
  status: DetectionStatus;
  // Set only while the job is running
  phase: DetectionPhase | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  // Set once the job is finished
  usage: DetectionUsage | null;
}

/** A job that isn't finished has no outcome yet. */
export interface PendingResult {
  outcome: null;
}

/** A Detection job: its envelope plus the result union, discriminated on `outcome`. */
export type DetectionJob = DetectionEnvelope &
  (PendingResult | DetectionResult);
