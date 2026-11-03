import type {
  VerificationChecks,
  VerificationReport,
} from '@banner-sweeper/api-interfaces';
import type {
  ContentScriptMessage,
  DetectedMessage,
  DoneMessage,
  FoundMessage,
  OptOutResultMessage,
} from '@duckduckgo/autoconsent';
import {
  AutoconsentSession,
  ContentScriptFrame,
  MessageMatcher,
  ReceivedMessage,
} from './autoconsent-session';
import type { StockCheckResult } from './stock-check';

// How long a Rule gets to find the banner, from the start of the run
export const DETECT_TIMEOUT_MS = 25_000;
// How long the Rule gets to opt out and finish, from finding the banner
export const DECLINE_TIMEOUT_MS = 45_000;

// What the checks found, before it's put into a Verification Report
interface Evidence {
  checks: VerificationChecks;
  // autoconsent's word for the frame the banner was found in
  popupFrameUrl: string | null;
  detectedMs: number | null;
  declinedMs: number | null;
}

/**
 * Judges a run of the existing Rules (Bundled plus Published): Covered when one of them finds the
 * banner and Declines it with a non-cosmetic completion. Every wait is a wall-clock timeout, because
 * autoconsent sends nothing when it finds nothing.
 */
export async function checkExistingRules(
  session: AutoconsentSession,
): Promise<StockCheckResult> {
  const found: ReceivedMessage<FoundMessage> | null = await session.waitFor(
    (message: ContentScriptMessage): message is FoundMessage =>
      message.type === 'popupFound',
    DETECT_TIMEOUT_MS - session.elapsedMs(),
  );

  if (!found) {
    const reason: string = nothingFoundReason(session);

    return {
      covered: false,
      notCoveredReason: reason,
      report: verificationReport(session, {
        checks: {
          detected: { status: 'failed', reason },
          declined: { status: 'skipped', reason: 'No banner to Decline' },
        },
        popupFrameUrl: null,
        detectedMs: null,
        declinedMs: null,
      }),
    };
  }

  const rule: string = found.message.cmp;
  const declined: DeclineOutcome = await waitForDecline(session, found);
  const report: VerificationReport = verificationReport(session, {
    checks: {
      detected: { status: 'passed', reason: `${rule} found the banner` },
      declined: {
        status: declined.passed ? 'passed' : 'failed',
        reason: declined.reason,
      },
    },
    popupFrameUrl: session.frameUrl(found.frame),
    detectedMs: found.atMs,
    declinedMs: declined.passed ? declined.atMs : null,
  });

  return declined.passed
    ? { covered: true, coveredBy: rule, report }
    : { covered: false, notCoveredReason: declined.reason, report };
}

function verificationReport(
  session: AutoconsentSession,
  evidence: Evidence,
): VerificationReport {
  return {
    checks: evidence.checks,
    timings: {
      totalMs: session.elapsedMs(),
      detectedMs: evidence.detectedMs,
      declinedMs: evidence.declinedMs,
    },
    messageLog: session.messageLog(),
    popupFrameUrl: evidence.popupFrameUrl,
  };
}

interface Declined {
  passed: true;
  reason: string;
  atMs: number;
}

interface NotDeclined {
  passed: false;
  reason: string;
}

type DeclineOutcome = Declined | NotDeclined;

async function waitForDecline(
  session: AutoconsentSession,
  found: ReceivedMessage<FoundMessage>,
): Promise<DeclineOutcome> {
  const rule: string = found.message.cmp;
  const deadlineMs: number = found.atMs + DECLINE_TIMEOUT_MS;
  const timeout: string = seconds(DECLINE_TIMEOUT_MS);
  // Only the Rule that found the banner, in the frame it found it in, can Decline it
  const fromSameRule = (
    message: ContentScriptMessage,
    frame: ContentScriptFrame,
  ): boolean =>
    frame.id === found.frame.id && 'cmp' in message && message.cmp === rule;
  const isOptOutResult: MessageMatcher<OptOutResultMessage> = (
    message: ContentScriptMessage,
    frame: ContentScriptFrame,
  ): message is OptOutResultMessage =>
    message.type === 'optOutResult' && fromSameRule(message, frame);
  const isDone: MessageMatcher<DoneMessage> = (
    message: ContentScriptMessage,
    frame: ContentScriptFrame,
  ): message is DoneMessage =>
    message.type === 'autoconsentDone' && fromSameRule(message, frame);

  const optOut: ReceivedMessage<OptOutResultMessage> | null =
    await session.waitFor(isOptOutResult, deadlineMs - session.elapsedMs());

  if (!optOut) {
    return {
      passed: false,
      reason: `${rule} didn't opt out within ${timeout}`,
    };
  }

  if (!optOut.message.result) {
    return { passed: false, reason: `${rule}'s opt-out failed` };
  }

  const done: ReceivedMessage<DoneMessage> | null = await session.waitFor(
    isDone,
    deadlineMs - session.elapsedMs(),
  );

  if (!done) {
    return { passed: false, reason: `${rule} didn't finish within ${timeout}` };
  }

  if (done.message.isCosmetic) {
    return {
      passed: false,
      reason: `${rule} only hid the banner (a cosmetic Rule)`,
    };
  }

  return {
    passed: true,
    reason: `${rule} opted out and finished without hiding the banner`,
    atMs: done.atMs,
  };
}

function nothingFoundReason(session: AutoconsentSession): string {
  const timeout: string = seconds(DETECT_TIMEOUT_MS);
  const detected: ReceivedMessage<DetectedMessage>[] =
    session.messagesOfType('cmpDetected');

  if (detected.length === 0) {
    return `No Rule found a banner within ${timeout}`;
  }

  const rules: string = [
    ...new Set(
      detected.map(
        (received: ReceivedMessage<DetectedMessage>): string =>
          received.message.cmp,
      ),
    ),
  ].join(', ');

  return `${rules} was detected, but found no banner within ${timeout}`;
}

function seconds(ms: number): string {
  return `${ms / 1000} s`;
}
