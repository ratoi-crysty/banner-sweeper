import type {
  BackgroundMessage,
  Config,
  RuleBundle,
} from '@duckduckgo/autoconsent';
import { evalSnippets } from '@duckduckgo/autoconsent';
import type { FrameContext } from '@banner-sweeper/autoconsent-config';
import { AutoconsentSession, ContentScriptFrame } from './autoconsent-session';

const CONFIG: Config = { autoAction: 'optOut' } as Config;

/** A frame's content script, as the session sees it through the isolated-world bridge. */
class FakeFrame implements ContentScriptFrame {
  readonly sent: BackgroundMessage[] = [];
  readonly evaluated: string[] = [];
  evalResult: Promise<unknown> = Promise.resolve(true);

  constructor(
    readonly id: string,
    readonly isMainFrame: boolean,
  ) {}

  async send(message: BackgroundMessage): Promise<void> {
    this.sent.push(message);
  }

  evalInMainWorld(code: string): Promise<unknown> {
    this.evaluated.push(code);

    return this.evalResult;
  }
}

// Tags the bundle with the frame it was built for, so the test can see which frame's rules were sent
function rulesFor(frame: FrameContext): RuleBundle {
  return {
    autoconsent: [],
    compact: undefined,
    frame,
  } as unknown as RuleBundle;
}

describe('AutoconsentSession, playing the extension background', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers init in the same frame with the config and that frame’s rules', async () => {
    const session: AutoconsentSession = new AutoconsentSession({
      config: CONFIG,
      rulesForFrame: rulesFor,
    });
    const iframe: FakeFrame = new FakeFrame('iw-2', false);

    await session.receive(
      { type: 'init', url: 'https://cmp.example/frame' },
      iframe,
    );

    expect(iframe.sent).toEqual([
      {
        type: 'initResp',
        config: CONFIG,
        rules: rulesFor({ url: 'https://cmp.example/frame', mainFrame: false }),
      },
    ]);
  });

  it("answers eval by running the bundled snippet in the frame's main world", async () => {
    const session: AutoconsentSession = new AutoconsentSession({
      config: CONFIG,
      rulesForFrame: rulesFor,
    });
    const frame: FakeFrame = new FakeFrame('iw-1', true);

    await session.receive(
      {
        type: 'eval',
        id: 'e1',
        code: 'page-supplied code',
        snippetId: 'EVAL_0',
      },
      frame,
    );

    expect(frame.evaluated).toEqual([`(${evalSnippets.EVAL_0.toString()})()`]);
    expect(frame.sent).toEqual([{ type: 'evalResp', id: 'e1', result: true }]);
  });

  it('never runs eval code that is not a bundled snippet', async () => {
    const session: AutoconsentSession = new AutoconsentSession({
      config: CONFIG,
      rulesForFrame: rulesFor,
    });
    const frame: FakeFrame = new FakeFrame('iw-1', true);

    await session.receive(
      { type: 'eval', id: 'e2', code: 'document.cookie = "x"' },
      frame,
    );

    expect(frame.evaluated).toEqual([]);
    expect(frame.sent).toEqual([{ type: 'evalResp', id: 'e2', result: false }]);
  });

  it("answers false within autoconsent's 1 s eval timeout when the page hangs", async () => {
    vi.useFakeTimers();
    const session: AutoconsentSession = new AutoconsentSession({
      config: CONFIG,
      rulesForFrame: rulesFor,
    });
    const frame: FakeFrame = new FakeFrame('iw-1', true);
    frame.evalResult = new Promise<unknown>((): void => undefined);

    const answered: Promise<void> = session.receive(
      { type: 'eval', id: 'e3', code: '', snippetId: 'EVAL_0' },
      frame,
    );
    await vi.advanceTimersByTimeAsync(999);
    expect(frame.sent).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await answered;

    expect(frame.sent).toEqual([{ type: 'evalResp', id: 'e3', result: false }]);
  });

  it('logs the messages per frame', async () => {
    vi.useFakeTimers({ now: 0 });
    const session: AutoconsentSession = new AutoconsentSession({
      config: CONFIG,
      rulesForFrame: rulesFor,
    });
    const top: FakeFrame = new FakeFrame('iw-1', true);

    await session.receive(
      { type: 'init', url: 'https://www.example.org/' },
      top,
    );
    await vi.advanceTimersByTimeAsync(1200);
    await session.receive(
      { type: 'cmpDetected', cmp: 'Onetrust', url: 'https://www.example.org/' },
      top,
    );

    expect(session.messageLog()).toEqual([
      {
        frameUrl: 'https://www.example.org/',
        mainFrame: true,
        messages: [
          { atMs: 0, type: 'init' },
          { atMs: 1200, type: 'cmpDetected', cmp: 'Onetrust' },
        ],
      },
    ]);
  });
});
