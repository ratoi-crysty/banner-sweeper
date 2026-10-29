import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import { Browser, BrowserContext, chromium } from 'playwright-core';
import { API_CONFIG } from '../api-config';
import type { ApiConfig } from '../api-config';
import { BrowserUnavailableError } from './browser-unavailable.error';
import { contextOptions } from './context-options';

const CONNECT_TIMEOUT_MS = 30_000;

/**
 * The connection to the Playwright browser server at `PLAYWRIGHT_HOST`, opened on first use and
 * reopened after a disconnect. Callers own the contexts they open and must close them.
 */
@Injectable()
export class BrowserService implements OnApplicationShutdown {
  private browser: Promise<Browser> | null = null;

  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig) {}

  async newContext(): Promise<BrowserContext> {
    const browser: Browser = await this.connect();

    try {
      return await browser.newContext(contextOptions(browser.version()));
    } catch (error: unknown) {
      throw new BrowserUnavailableError(error);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    const browser: Browser | null = await (this.browser?.catch(
      (): null => null,
    ) ?? null);
    await browser?.close();
  }

  private connect(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    const connecting: Promise<Browser> = chromium
      .connect(this.config.playwrightHost, { timeout: CONNECT_TIMEOUT_MS })
      .then(
        (browser: Browser): Browser => {
          browser.on('disconnected', (): void => this.forget(connecting));

          return browser;
        },
        (error: unknown): never => {
          this.forget(connecting);
          throw new BrowserUnavailableError(error);
        },
      );
    this.browser = connecting;

    return connecting;
  }

  private forget(connection: Promise<Browser>): void {
    if (this.browser === connection) {
      this.browser = null;
    }
  }
}
