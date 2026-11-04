import { Browser, BrowserContext, Frame, LaunchOptions, Page, Route, chromium } from 'playwright-core';
import { MessageHandler, MessageTransport, injectIntoIsolatedWorld } from './isolated-world';

// Needs a Playwright 1.64 browser server, but not the internet: the pages are served by routing
const PLAYWRIGHT_HOST: string | undefined = process.env['PLAYWRIGHT_HOST'];

const TOP_URL = 'http://top.test/';
// Same site as the top page, so it always shares the top page's process
const SAME_SITE_URL = 'http://top.test/same';
// Another site: full Chromium puts it in its own process (an out-of-process iframe), the headless
// shell doesn't, and the bridge reaches the two through different CDP sessions
const CROSS_SITE_URL = 'http://frame.test/';
const CROSS_SITE_NEXT_URL = 'http://frame.test/next';

// Each page records its name where only the page's own JavaScript can see it
function pageHtml(secret: string, body = ''): string {
  return `<!doctype html><script>window.pageSecret = '${secret}';</script>${body}`;
}

const PAGES: Record<string, string> = {
  [TOP_URL]: pageHtml('top', `<iframe src="${SAME_SITE_URL}"></iframe><iframe src="${CROSS_SITE_URL}"></iframe>`),
  [SAME_SITE_URL]: pageHtml('same'),
  [CROSS_SITE_URL]: pageHtml('cross'),
  [CROSS_SITE_NEXT_URL]: pageHtml('next'),
};

// Stands in for autoconsent: reports in once per document, and answers pings
const STUB_CONTENT_SCRIPT = `
window.autoconsentReceiveMessage = (message) => {
  if (message.type === 'ping') {
    window.autoconsentSendMessage({ type: 'pong', id: message.id, url: location.href });
  }
};
window.autoconsentSendMessage({ type: 'init', url: location.href, seesPageSecret: typeof window.pageSecret });
`;

interface InitMessage {
  type: 'init';
  url: string;
  seesPageSecret: string;
}

interface PongMessage {
  type: 'pong';
  id: string;
  url: string;
}

type StubMessage = InitMessage | PongMessage;

interface Received {
  message: StubMessage;
  frameRef: string;
}

interface BrowserBuild {
  name: string;
  // Sent to the browser server, which launches a browser per connection
  launchOptions: LaunchOptions;
  crossSiteOutOfProcess: boolean;
}

const BUILDS: BrowserBuild[] = [
  {
    name: 'the headless shell (the server default)',
    launchOptions: {},
    crossSiteOutOfProcess: false,
  },
  {
    name: 'full Chromium',
    launchOptions: { channel: 'chromium' },
    crossSiteOutOfProcess: true,
  },
];

describe.skipIf(!PLAYWRIGHT_HOST)('injectIntoIsolatedWorld', () => {
  describe.each(BUILDS)('on $name', (build: BrowserBuild) => {
    let browser: Browser;
    let context: BrowserContext;
    let page: Page;
    let transport: MessageTransport;
    let received: Received[];

    beforeAll(async () => {
      browser = await chromium.connect(PLAYWRIGHT_HOST as string, {
        headers: {
          'x-playwright-launch-options': JSON.stringify(build.launchOptions),
        },
      });
    });

    afterAll(async () => {
      await browser.close();
    });

    beforeEach(async () => {
      received = [];
      context = await browser.newContext();
      await context.route('**/*', async (route: Route): Promise<void> => {
        const html: string | undefined = PAGES[route.request().url()];
        await (html === undefined
          ? route.fulfill({ status: 404 })
          : route.fulfill({ contentType: 'text/html', body: html }));
      });
      page = await context.newPage();
      await injectIntoIsolatedWorld(
        page,
        (bridge: MessageTransport): MessageHandler => {
          transport = bridge;

          return (message: unknown, frameRef: string): void => {
            // The stub script only ever sends these shapes
            received.push({ message: message as StubMessage, frameRef });
          };
        },
        STUB_CONTENT_SCRIPT,
      );
      await page.goto(TOP_URL);
    });

    afterEach(async () => {
      await context.close();
    });

    function initsFrom(url: string): Received[] {
      return received.filter(({ message }: Received): boolean => message.type === 'init' && message.url === url);
    }

    async function initFrom(url: string): Promise<Received> {
      return vi.waitFor(
        (): Received => {
          const [init]: Received[] = initsFrom(url);

          if (!init) {
            throw new Error(`No init from ${url} yet`);
          }

          return init;
        },
        { timeout: 10_000 },
      );
    }

    function frameAt(url: string): Frame {
      const frame: Frame | undefined = page.frame({ url }) ?? undefined;

      if (!frame) {
        throw new Error(`No frame at ${url}`);
      }

      return frame;
    }

    it('runs the script once in every document, each in its own world', async () => {
      // Precondition: the iframes are where this build should put them, so the intended bridge path runs
      const crossSiteSession: Promise<unknown> = context.newCDPSession(frameAt(CROSS_SITE_URL));
      await (build.crossSiteOutOfProcess
        ? expect(crossSiteSession).resolves.toBeDefined()
        : expect(crossSiteSession).rejects.toThrow());
      await expect(context.newCDPSession(frameAt(SAME_SITE_URL))).rejects.toThrow();

      const inits: Received[] = await Promise.all([TOP_URL, SAME_SITE_URL, CROSS_SITE_URL].map(initFrom));
      await page.waitForTimeout(300);

      expect(initsFrom(TOP_URL)).toHaveLength(1);
      expect(initsFrom(SAME_SITE_URL)).toHaveLength(1);
      expect(initsFrom(CROSS_SITE_URL)).toHaveLength(1);
      expect(new Set(inits.map(({ frameRef }: Received): string => frameRef)).size).toBe(3);
    });

    it('tells the top frame from the iframes', async () => {
      const top: Received = await initFrom(TOP_URL);
      const sameSite: Received = await initFrom(SAME_SITE_URL);
      const crossSite: Received = await initFrom(CROSS_SITE_URL);

      expect(transport.isMainFrame(top.frameRef)).toBe(true);
      expect(transport.isMainFrame(sameSite.frameRef)).toBe(false);
      expect(transport.isMainFrame(crossSite.frameRef)).toBe(false);
    });

    it("keeps the script apart from the page's JavaScript, but evals there on request", async () => {
      const top: Received = await initFrom(TOP_URL);
      const sameSite: Received = await initFrom(SAME_SITE_URL);
      const crossSite: Received = await initFrom(CROSS_SITE_URL);

      expect(
        [top, sameSite, crossSite].map(({ message }: Received): string =>
          message.type === 'init' ? message.seesPageSecret : message.type,
        ),
      ).toEqual(['undefined', 'undefined', 'undefined']);
      expect(await transport.evalInMainWorld(top.frameRef, 'window.pageSecret')).toBe('top');
      expect(await transport.evalInMainWorld(sameSite.frameRef, 'window.pageSecret')).toBe('same');
      expect(await transport.evalInMainWorld(crossSite.frameRef, 'window.pageSecret')).toBe('cross');
    });

    it('delivers a message only to the frame it is for', async () => {
      await initFrom(TOP_URL);
      await initFrom(SAME_SITE_URL);
      const crossSite: Received = await initFrom(CROSS_SITE_URL);

      await transport.sendToContentScript(crossSite.frameRef, {
        type: 'ping',
        id: 'p1',
      });
      await page.waitForTimeout(300);

      expect(
        received
          .map(({ message }: Received): StubMessage => message)
          .filter((message: StubMessage): boolean => message.type === 'pong'),
      ).toEqual([{ type: 'pong', id: 'p1', url: CROSS_SITE_URL }]);
    });

    it("runs the script again in a frame's next document", async () => {
      const first: Received = await initFrom(CROSS_SITE_URL);

      await frameAt(CROSS_SITE_URL).goto(CROSS_SITE_NEXT_URL);
      const next: Received = await initFrom(CROSS_SITE_NEXT_URL);

      expect(next.frameRef).not.toBe(first.frameRef);
      expect(transport.isMainFrame(next.frameRef)).toBe(false);
      expect(await transport.evalInMainWorld(next.frameRef, 'window.pageSecret')).toBe('next');
    });
  });
});
