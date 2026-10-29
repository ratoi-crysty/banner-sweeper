import type { VerificationChecks } from '@banner-sweeper/api-interfaces';
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
  ReceivedMessage,
} from './autoconsent-session';

// How long a Rule gets to find the popup, from the start of the run
export const DETECT_TIMEOUT_MS = 25_000;
// How long the Rule gets to opt out and finish, from finding the popup
export const DECLINE_TIMEOUT_MS = 45_000;

export interface ExistingRulesVerdict {
  checks: VerificationChecks;
  // The Rule that Declined the banner, `null` when the Site isn't Covered
  coveredBy: string | null;
  notCoveredReason: string | null;
  popupFrameUrl: string | null;
  detectedMs: number | null;
  declinedMs: number | null;
}

/**
 * Judges a run of the existing Rules (Bundled plus Published): Covered when one of them finds the
 * popup and Declines it with a non-cosmetic completion. Every wait is a wall-clock timeout, because
 * autoconsent sends nothing when it finds nothing.
 */
export async function checkExistingRules(
  session: AutoconsentSession,
): Promise<ExistingRulesVerdict> {
  const popup: ReceivedMessage<FoundMessage> | null = await session.waitFor(
    (message: ContentScriptMessage): message is FoundMessage =>
      message.type === 'popupFound',
    DETECT_TIMEOUT_MS - session.elapsedMs(),
  );

  if (!popup) {
    const reason: string = nothingFoundReason(session);

    return {
      checks: {
        detected: { status: 'failed', reason },
        declined: { status: 'skipped', reason: 'No popup to Decline' },
      },
      coveredBy: null,
      notCoveredReason: reason,
      popupFrameUrl: null,
      detectedMs: null,
      declinedMs: null,
    };
  }

  const cmp: string = popup.message.cmp;
  const declined: DeclineOutcome = await waitForDecline(session, popup);
  const notCoveredReason: string | null = declined.passed
    ? null
    : declined.reason;

  return {
    checks: {
      detected: { status: 'passed', reason: `${cmp} found the popup` },
      declined: {
        status: declined.passed ? 'passed' : 'failed',
        reason: declined.reason,
      },
    },
    coveredBy: declined.passed ? cmp : null,
    notCoveredReason,
    popupFrameUrl: session.frameUrl(popup.frame),
    detectedMs: popup.atMs,
    declinedMs: declined.passed ? declined.atMs : null,
  };
}

interface DeclineOutcome {
  passed: boolean;
  reason: string;
  atMs: number;
}

async function waitForDecline(
  session: AutoconsentSession,
  popup: ReceivedMessage<FoundMessage>,
): Promise<DeclineOutcome> {
  const cmp: string = popup.message.cmp;
  const deadlineMs: number = popup.atMs + DECLINE_TIMEOUT_MS;
  const fromPopupRule = (
    message: ContentScriptMessage,
    frame: ContentScriptFrame,
  ): boolean =>
    frame.id === popup.frame.id && 'cmp' in message && message.cmp === cmp;

  const optOut: ReceivedMessage<OptOutResultMessage> | null =
    await session.waitFor(
      (
        message: ContentScriptMessage,
        frame: ContentScriptFrame,
      ): message is OptOutResultMessage =>
        message.type === 'optOutResult' && fromPopupRule(message, frame),
      deadlineMs - session.elapsedMs(),
    );

  if (!optOut) {
    return {
      passed: false,
      reason: `${cmp} didn't opt out within 45 s`,
      atMs: 0,
    };
  }

  if (!optOut.message.result) {
    return {
      passed: false,
      reason: `${cmp}'s opt-out failed`,
      atMs: optOut.atMs,
    };
  }

  const done: ReceivedMessage<DoneMessage> | null = await session.waitFor(
    (
      message: ContentScriptMessage,
      frame: ContentScriptFrame,
    ): message is DoneMessage =>
      message.type === 'autoconsentDone' && fromPopupRule(message, frame),
    deadlineMs - session.elapsedMs(),
  );

  if (!done) {
    return {
      passed: false,
      reason: `${cmp} didn't finish within 45 s`,
      atMs: 0,
    };
  }

  if (done.message.isCosmetic) {
    return {
      passed: false,
      reason: `${cmp} only hid the banner (a cosmetic Rule)`,
      atMs: done.atMs,
    };
  }

  return {
    passed: true,
    reason: `${cmp} opted out and finished without hiding the banner`,
    atMs: done.atMs,
  };
}

function nothingFoundReason(session: AutoconsentSession): string {
  const detected: ReceivedMessage<DetectedMessage>[] =
    session.messagesOfType('cmpDetected');

  if (detected.length === 0) {
    return 'No Rule detected a popup within 25 s';
  }

  const names: string = [
    ...new Set(
      detected.map(
        (received: ReceivedMessage<DetectedMessage>): string =>
          received.message.cmp,
      ),
    ),
  ].join(', ');

  return `${names} was detected, but no popup was found within 25 s`;
}
