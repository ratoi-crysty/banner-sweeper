import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import {
  Browser,
  BrowserContext,
  LaunchOptions,
  chromium,
} from 'playwright-core';
import { apiConfig } from '../../../config/api.config';
import type { ApiConfig } from '../../../config/api.config';
import { BrowserUnavailableError } from './browser-unavailable.error';
import { contextOptions } from './context-options';

const CONNECT_TIMEOUT_MS = 30_000;

// The server launches a browser per connection, by default the stripped-down headless shell. Ask
// for full Chromium in its new headless mode instead: the browser users run, with the same site
// isolation, and harder for bot checks to tell apart.
const LAUNCH_OPTIONS: LaunchOptions = { channel: 'chromium' };

/**
 * The connection to the Playwright browser server at `PLAYWRIGHT_HOST`, opened on first use and
 * reopened after a disconnect. Callers own the contexts they open and must close them.
 */
@Injectable()
export class BrowserService implements OnApplicationShutdown {
  protected browser: Promise<Browser> | undefined;

  constructor(@Inject(apiConfig.KEY) protected readonly config: ApiConfig) {}

  async newContext(): Promise<BrowserContext> {
    const browser: Browser = await this.connect();

    try {
      return await browser.newContext(
        contextOptions(browser.version(), {
          locale: this.config.browserLocale,
          timezoneId: this.config.browserTimezone,
        }),
      );
    } catch (error: unknown) {
      throw new BrowserUnavailableError(error);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.browser) {
      return;
    }

    // A connection that fails during shutdown leaves nothing to close
    const browser: Browser | undefined = await this.browser.catch(
      (): undefined => undefined,
    );
    await browser?.close();
  }

  protected connect(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    const connecting: Promise<Browser> = chromium
      .connect(this.config.playwrightHost, {
        timeout: CONNECT_TIMEOUT_MS,
        headers: {
          'x-playwright-launch-options': JSON.stringify(LAUNCH_OPTIONS),
        },
      })
      .then((browser: Browser): Browser => {
        browser.on('disconnected', (): void => this.forget(connecting));

        return browser;
      })
      .catch((error: unknown): never => {
        this.forget(connecting);
        throw new BrowserUnavailableError(error);
      });

    this.browser = connecting;

    return connecting;
  }

  protected forget(connection: Promise<Browser>): void {
    if (this.browser === connection) {
      this.browser = undefined;
    }
  }
}
