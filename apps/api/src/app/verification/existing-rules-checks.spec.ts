import type {
  Config,
  ContentScriptMessage,
  RuleBundle,
} from '@duckduckgo/autoconsent';
import { AutoconsentSession, ContentScriptFrame } from './autoconsent-session';
import {
  ExistingRulesVerdict,
  checkExistingRules,
} from './existing-rules-checks';

const TOP: ContentScriptFrame = {
  id: 'iw-top',
  isMainFrame: true,
  send: async (): Promise<void> => undefined,
  evalInMainWorld: async (): Promise<unknown> => false,
};
const CMP_FRAME: ContentScriptFrame = {
  ...TOP,
  id: 'iw-cmp',
  isMainFrame: false,
};
const URL_TOP = 'https://www.example.org/';
const URL_CMP = 'https://cmp.example/notice';

describe('checkExistingRules', () => {
  let session: AutoconsentSession;

  beforeEach(() => {
    vi.useFakeTimers({ now: 0 });
    session = new AutoconsentSession({
      config: {} as Config,
      rulesForFrame: (): RuleBundle => ({ autoconsent: [] }),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function receiveAt(
    atMs: number,
    message: ContentScriptMessage,
    frame: ContentScriptFrame = TOP,
  ): Promise<void> {
    await vi.advanceTimersByTimeAsync(atMs - Date.now());
    await session.receive(message, frame);
  }

  it('is Covered when a Rule finds the banner and Declines it', async () => {
    const verdict: Promise<ExistingRulesVerdict> = checkExistingRules(session);

    await receiveAt(0, { type: 'init', url: URL_CMP }, CMP_FRAME);
    await receiveAt(
      800,
      { type: 'cmpDetected', cmp: 'Sourcepoint-frame', url: URL_CMP },
      CMP_FRAME,
    );
    await receiveAt(
      1500,
      { type: 'popupFound', cmp: 'Sourcepoint-frame', url: URL_CMP },
      CMP_FRAME,
    );
    await receiveAt(
      2600,
      {
        type: 'optOutResult',
        cmp: 'Sourcepoint-frame',
        result: true,
        scheduleSelfTest: false,
        url: URL_CMP,
      },
      CMP_FRAME,
    );
    await receiveAt(
      3900,
      {
        type: 'autoconsentDone',
        cmp: 'Sourcepoint-frame',
        isCosmetic: false,
        url: URL_CMP,
        duration: 2400,
        totalClicks: 2,
      },
      CMP_FRAME,
    );

    expect(await verdict).toEqual({
      covered: true,
      coveredBy: 'Sourcepoint-frame',
      popupFrameUrl: URL_CMP,
      detectedMs: 1500,
      declinedMs: 3900,
      checks: {
        detected: {
          status: 'passed',
          reason: 'Sourcepoint-frame found the banner',
        },
        declined: {
          status: 'passed',
          reason:
            'Sourcepoint-frame opted out and finished without hiding the banner',
        },
      },
    });
  });

  it('is not Covered when a Rule only hides the banner', async () => {
    const verdict: Promise<ExistingRulesVerdict> = checkExistingRules(session);

    await receiveAt(1000, {
      type: 'popupFound',
      cmp: 'cc_banner',
      url: URL_TOP,
    });
    await receiveAt(1100, {
      type: 'optOutResult',
      cmp: 'cc_banner',
      result: true,
      scheduleSelfTest: false,
      url: URL_TOP,
    });
    await receiveAt(1200, {
      type: 'autoconsentDone',
      cmp: 'cc_banner',
      isCosmetic: true,
      url: URL_TOP,
      duration: 100,
      totalClicks: 0,
    });

    expect(await verdict).toMatchObject({
      covered: false,
      notCoveredReason: 'cc_banner only hid the banner (a cosmetic Rule)',
      checks: {
        detected: { status: 'passed' },
        declined: {
          status: 'failed',
          reason: 'cc_banner only hid the banner (a cosmetic Rule)',
        },
      },
    });
  });

  it('is not Covered when the opt-out fails', async () => {
    const verdict: Promise<ExistingRulesVerdict> = checkExistingRules(session);

    await receiveAt(1000, {
      type: 'popupFound',
      cmp: 'Onetrust',
      url: URL_TOP,
    });
    await receiveAt(5000, {
      type: 'optOutResult',
      cmp: 'Onetrust',
      result: false,
      scheduleSelfTest: false,
      url: URL_TOP,
    });

    expect(await verdict).toMatchObject({
      covered: false,
      notCoveredReason: "Onetrust's opt-out failed",
      checks: {
        declined: { status: 'failed', reason: "Onetrust's opt-out failed" },
      },
    });
  });

  it('gives up when no banner is found within 25 s', async () => {
    const verdict: Promise<ExistingRulesVerdict> = checkExistingRules(session);
    let settled = false;
    void verdict.then((): void => {
      settled = true;
    });

    await receiveAt(3000, { type: 'cmpDetected', cmp: 'didomi', url: URL_TOP });
    await vi.advanceTimersByTimeAsync(25_000 - 3000 - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await verdict).toEqual({
      covered: false,
      notCoveredReason: 'didomi was detected, but found no banner within 25 s',
      popupFrameUrl: null,
      detectedMs: null,
      declinedMs: null,
      checks: {
        detected: {
          status: 'failed',
          reason: 'didomi was detected, but found no banner within 25 s',
        },
        declined: { status: 'skipped', reason: 'No banner to Decline' },
      },
    });
  });

  it('says when no Rule detected anything', async () => {
    const verdict: Promise<ExistingRulesVerdict> = checkExistingRules(session);

    await vi.advanceTimersByTimeAsync(25_000);

    expect(await verdict).toMatchObject({
      covered: false,
      notCoveredReason: 'No Rule found a banner within 25 s',
    });
  });

  it('gives up when the Rule does not finish within 45 s of finding the banner', async () => {
    const verdict: Promise<ExistingRulesVerdict> = checkExistingRules(session);

    await receiveAt(2000, {
      type: 'popupFound',
      cmp: 'Onetrust',
      url: URL_TOP,
    });
    await receiveAt(3000, {
      type: 'optOutResult',
      cmp: 'Onetrust',
      result: true,
      scheduleSelfTest: false,
      url: URL_TOP,
    });
    await vi.advanceTimersByTimeAsync(45_000);

    expect(await verdict).toMatchObject({
      covered: false,
      notCoveredReason: "Onetrust didn't finish within 45 s",
      detectedMs: 2000,
      declinedMs: null,
    });
  });

  it('only counts the frame the banner was found in', async () => {
    const verdict: Promise<ExistingRulesVerdict> = checkExistingRules(session);

    await receiveAt(1000, {
      type: 'popupFound',
      cmp: 'Onetrust',
      url: URL_TOP,
    });
    await receiveAt(
      1100,
      {
        type: 'optOutResult',
        cmp: 'Onetrust',
        result: true,
        scheduleSelfTest: false,
        url: URL_CMP,
      },
      CMP_FRAME,
    );
    await receiveAt(
      1200,
      {
        type: 'autoconsentDone',
        cmp: 'Onetrust',
        isCosmetic: false,
        url: URL_CMP,
        duration: 100,
        totalClicks: 1,
      },
      CMP_FRAME,
    );
    await vi.advanceTimersByTimeAsync(45_000);

    expect((await verdict).covered).toBe(false);
  });
});
