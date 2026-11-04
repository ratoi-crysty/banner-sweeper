import type { CheckResult, VerificationReport } from '@banner-sweeper/api-interfaces';
import type { ContentScriptMessage, DetectedMessage, DoneMessage, FoundMessage } from '@duckduckgo/autoconsent';
import { AutoconsentSession, ContentScriptFrame, MessageMatcher, ReceivedMessage } from './autoconsent-session';
import type { StockCheckResult } from './stock-check';

// How long a Rule gets to find the banner, from the start of the run
export const DETECT_TIMEOUT_MS = 25_000;
// How long the Rule gets to opt out and finish, from finding the banner
export const DECLINE_TIMEOUT_MS = 45_000;

type MessageOfType<T extends ContentScriptMessage['type']> = Extract<ContentScriptMessage, { type: T }>;

// What the judge found out, for the Verification Report
interface Findings {
  detected: CheckResult;
  declined: CheckResult;
  // The banner being found, and the Rule finishing its refusal, when they happened
  found?: ReceivedMessage<FoundMessage>;
  declinedBy?: ReceivedMessage<DoneMessage>;
}

const isPopupFound: MessageMatcher<FoundMessage> = (message: ContentScriptMessage): message is FoundMessage =>
  message.type === 'popupFound';

/**
 * The judge: decides from autoconsent's messages whether the existing Rules (Bundled plus
 * Published) Decline the Site's banner, by asking three questions in order. autoconsent sends
 * nothing when nothing happens, so each question has a deadline, and silence past it means no.
 */
export async function checkExistingRules(session: AutoconsentSession): Promise<StockCheckResult> {
  // 1. Did an existing Rule find the banner within 25 s?
  const found: ReceivedMessage<FoundMessage> | undefined = await session.waitFor(
    isPopupFound,
    DETECT_TIMEOUT_MS - session.elapsedMs(),
  );

  if (!found) {
    const reason: string = nothingFoundReason(session);

    return {
      covered: false,
      notCoveredReason: reason,
      report: verificationReport(session, {
        detected: { status: 'failed', reason },
        declined: { status: 'skipped', reason: 'No banner to Decline' },
      }),
    };
  }

  // From here on, only that Rule's messages from that frame count, within 45 s of finding the banner
  const rule: string = found.message.cmp;
  const deadlineMs: number = found.atMs + DECLINE_TIMEOUT_MS;
  const timeout: string = seconds(DECLINE_TIMEOUT_MS);
  const detected: CheckResult = {
    status: 'passed',
    reason: `${rule} found the banner`,
  };
  const notCovered = (reason: string): StockCheckResult => ({
    covered: false,
    notCoveredReason: reason,
    report: verificationReport(session, {
      detected,
      declined: { status: 'failed', reason },
      found,
    }),
  });

  // 2. Did that Rule refuse?
  const optOut: ReceivedMessage<MessageOfType<'optOutResult'>> | undefined = await waitForRule(
    session,
    found,
    'optOutResult',
    deadlineMs,
  );

  if (!optOut) {
    return notCovered(`${rule} didn't opt out within ${timeout}`);
  }

  if (!optOut.message.result) {
    return notCovered(`${rule}'s opt-out failed`);
  }

  // 3. Did it finish, without only hiding the banner?
  const done: ReceivedMessage<DoneMessage> | undefined = await waitForRule(
    session,
    found,
    'autoconsentDone',
    deadlineMs,
  );

  if (!done) {
    return notCovered(`${rule} didn't finish within ${timeout}`);
  }

  if (done.message.isCosmetic) {
    return notCovered(`${rule} only hid the banner (a cosmetic Rule)`);
  }

  return {
    covered: true,
    coveredBy: rule,
    report: verificationReport(session, {
      detected,
      declined: {
        status: 'passed',
        reason: `${rule} opted out and finished without hiding the banner`,
      },
      found,
      declinedBy: done,
    }),
  };
}

// The first `type` message from the Rule that found the banner, in the frame it found it in
function waitForRule<T extends 'optOutResult' | 'autoconsentDone'>(
  session: AutoconsentSession,
  found: ReceivedMessage<FoundMessage>,
  type: T,
  deadlineMs: number,
): Promise<ReceivedMessage<MessageOfType<T>> | undefined> {
  const matches: MessageMatcher<MessageOfType<T>> = (
    message: ContentScriptMessage,
    frame: ContentScriptFrame,
  ): message is MessageOfType<T> =>
    message.type === type && frame.id === found.frame.id && 'cmp' in message && message.cmp === found.message.cmp;

  return session.waitFor(matches, deadlineMs - session.elapsedMs());
}

// The report is the JSON contract, where a missing value is `null` so the key stays present
function verificationReport(session: AutoconsentSession, findings: Findings): VerificationReport {
  return {
    checks: { detected: findings.detected, declined: findings.declined },
    timings: {
      totalMs: session.elapsedMs(),
      detectedMs: findings.found?.atMs ?? null,
      declinedMs: findings.declinedBy?.atMs ?? null,
    },
    messageLog: session.messageLog(),
    popupFrameUrl: findings.found ? session.frameUrl(findings.found.frame) : null,
  };
}

function nothingFoundReason(session: AutoconsentSession): string {
  const timeout: string = seconds(DETECT_TIMEOUT_MS);
  const detected: ReceivedMessage<DetectedMessage>[] = session.messagesOfType('cmpDetected');

  if (detected.length === 0) {
    return `No existing Rule recognised a banner within ${timeout}`;
  }

  const rules: string = [
    ...new Set(detected.map((received: ReceivedMessage<DetectedMessage>): string => received.message.cmp)),
  ].join(', ');

  return `${rules} was detected, but found no banner within ${timeout}`;
}

function seconds(ms: number): string {
  return `${ms / 1000} s`;
}
