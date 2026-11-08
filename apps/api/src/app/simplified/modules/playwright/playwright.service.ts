import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Page, type Response } from 'playwright';
import { PLAYWRIGHT_OPTIONS } from './playwright.constants';
import { DEFAULT_LAUNCH_ARGS, type BlockInfo, type ContextSettings, type PlaywrightModuleOptions } from './types';

const CHALLENGE_RE =
  /just a moment|checking your browser|attention required|access denied|verify you are human|are you a robot|request unsuccessful|pardon our interruption|captcha/i;

/**
 * Owns the single shared Browser (launched locally or connected to a server) and hands out
 * fresh contexts that look like a regular Chrome. Reconnects lazily if the browser goes away.
 */
@Injectable()
export class PlaywrightService implements OnModuleDestroy {
  private readonly logger = new Logger(PlaywrightService.name);
  private browser?: Promise<Browser>;
  private contextDefaults?: Promise<BrowserContextOptions>;

  constructor(@Inject(PLAYWRIGHT_OPTIONS) private readonly options: PlaywrightModuleOptions) {}

  getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = this.open()
        .then((browser) => {
          browser.on('disconnected', () => {
            this.logger.warn('Browser disconnected; will reconnect on next use.');
            this.browser = undefined;
            this.contextDefaults = undefined;
          });
          return browser;
        })
        .catch((err) => {
          this.browser = undefined;
          throw err;
        });
    }
    return this.browser;
  }

  async browserName(): Promise<string> {
    return (await this.getBrowser()).browserType().name();
  }

  /** Fresh context (no cookies) with realistic defaults + per-call settings. */
  async newContext(settings: ContextSettings = {}): Promise<BrowserContext> {
    const browser = await this.getBrowser();
    this.contextDefaults ??= this.probeDefaults(browser);
    return browser.newContext({ ...(await this.contextDefaults), ...stripUndefined(settings) });
  }

  /** Did the site serve an error or bot-challenge page instead of the real one? */
  async detectBlock(page: Page, response: Response | null): Promise<BlockInfo> {
    const status = response?.status();
    if (status && status >= 400) return { blocked: true, reason: `HTTP ${status} on ${page.url()}` };
    const title = await page.title().catch(() => '');
    const text = (await page.locator('body').innerText({ timeout: 2000 }).catch(() => '')).slice(0, 2000);
    if (CHALLENGE_RE.test(title) || (text.length < 600 && CHALLENGE_RE.test(text))) {
      return { blocked: true, reason: `Bot challenge page ("${title || text.slice(0, 60)}")` };
    }
    return { blocked: false };
  }

  async onModuleDestroy(): Promise<void> {
    const browser = await this.browser?.catch(() => undefined);
    await browser?.close().catch(() => {
      // do nothing
    });
  }

  private async open(): Promise<Browser> {
    const { mode, wsEndpoint, headless = true, channel, executablePath } = this.options;
    const args = [...(this.options.launchArgs ?? DEFAULT_LAUNCH_ARGS)];

    if (mode === 'connect') {
      if (!wsEndpoint) throw new Error('PlaywrightModule: wsEndpoint is required in connect mode.');
      this.logger.log(`Connecting to browser server ${wsEndpoint}`);
      // Launch options travel in this (undocumented, but used by Playwright tooling) header.
      // A default `run-server` ignores `args`; docker/server.mjs sets them server-side instead.
      const launchOptions = { headless, ...(channel ? { channel } : {}), ...(this.options.sendArgsOnConnect ? { args } : {}) };
      return chromium.connect(wsEndpoint, { headers: { 'x-playwright-launch-options': JSON.stringify(launchOptions) } });
    }

    this.logger.log(`Launching Chromium (headless=${headless}${channel ? `, channel=${channel}` : ''})`);
    return chromium.launch({ headless, channel, executablePath, args });
  }

  /** Same "browser" for every context: no "HeadlessChrome" in the UA, a common viewport. */
  private async probeDefaults(browser: Browser): Promise<BrowserContextOptions> {
    const probe = await browser.newContext();
    try {
      const ua = await (await probe.newPage()).evaluate(() => navigator.userAgent);
      return { userAgent: ua.replace('HeadlessChrome', 'Chrome'), viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 };
    } finally {
      await probe.close();
    }
  }
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}
