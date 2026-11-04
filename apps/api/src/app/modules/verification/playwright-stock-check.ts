import { Injectable } from '@nestjs/common';
import {
  autoconsentConfig,
  compactRulesForFrame,
} from '@banner-sweeper/autoconsent-config';
import type { FrameContext } from '@banner-sweeper/autoconsent-config';
import type {
  AutoConsentCMPRule,
  ContentScriptMessage,
  RuleBundle,
} from '@duckduckgo/autoconsent';
import type { BrowserContext, Page } from 'playwright-core';
import { BrowserUnavailableError } from '../browser/browser-unavailable.error';
import { BrowserService } from '../browser/browser.service';
import {
  MessageHandler,
  MessageTransport,
  injectIntoIsolatedWorld,
} from '../browser/isolated-world';
import { getAutoconsentBundle } from './autoconsent.utils';
import { AutoconsentSession, ContentScriptFrame } from './autoconsent-session';
import { checkExistingRules } from './existing-rules-checks';
import { PublishedRuleSource } from './published-rule-source';
import { SiteUnreachableError } from './site-unreachable.error';
import { StockCheck, StockCheckResult } from './stock-check';

const NAVIGATION_TIMEOUT_MS = 30_000;

/**
 * The stock check in a real browser: start autoconsent the way the extension does, open the Site,
 * and let the judge decide. Each run gets a fresh context, which is always closed afterwards.
 */
@Injectable()
export class PlaywrightStockCheck extends StockCheck {
  constructor(
    protected readonly browser: BrowserService,
    protected readonly publishedRules: PublishedRuleSource,
  ) {
    super();
  }

  async run(url: string, signal: AbortSignal): Promise<StockCheckResult> {
    const session: AutoconsentSession = await this.newSession();

    return this.inFreshContext(
      signal,
      (): void => session.cancel(),
      async (page: Page): Promise<StockCheckResult> => {
        await this.startAutoconsent(page, session);
        await this.openSite(page, url);
        const result: StockCheckResult = await checkExistingRules(session);
        this.ensureBrowserConnected(page);

        return result;
      },
    );
  }

  // The extension's exact config (heuristics stay off) and Rules: Bundled plus Published
  protected async newSession(): Promise<AutoconsentSession> {
    const published: AutoConsentCMPRule[] = await this.publishedRules.list();

    return new AutoconsentSession({
      config: autoconsentConfig,
      rulesForFrame: (frame: FrameContext): RuleBundle => ({
        autoconsent: published,
        compact: compactRulesForFrame(frame),
      }),
    });
  }

  /**
   * Runs `work` on a page in a fresh browser context, and always closes the context afterwards.
   * If `signal` aborts, the context closes at once (which stops navigation), `onAbort` runs, and
   * the run fails with the abort reason: a result reached after that means nothing.
   */
  protected async inFreshContext<T>(
    signal: AbortSignal,
    onAbort: () => void,
    work: (page: Page) => Promise<T>,
  ): Promise<T> {
    signal.throwIfAborted();
    const context: BrowserContext = await this.browser.newContext();
    const abort: () => void = (): void => {
      onAbort();
      void context.close().catch((): void => undefined);
    };
    signal.addEventListener('abort', abort, { once: true });

    try {
      // It may have aborted while the context was opening, before the listener was there
      signal.throwIfAborted();
      const result: T = await work(await context.newPage());
      signal.throwIfAborted();

      return result;
    } finally {
      signal.removeEventListener('abort', abort);
      await context.close().catch((): void => undefined);
    }
  }

  // Puts autoconsent in every frame of the page, and sends everything it says to the session
  protected async startAutoconsent(
    page: Page,
    session: AutoconsentSession,
  ): Promise<void> {
    const bundle: string = await getAutoconsentBundle();

    await injectIntoIsolatedWorld(
      page,
      (transport: MessageTransport): MessageHandler =>
        (message: unknown, frameRef: string): void => {
          // Only our content script can call the isolated world's binding
          void session
            .receive(
              message as ContentScriptMessage,
              this.contentScriptFrame(transport, frameRef),
            )
            .catch((): void => undefined);
        },
      bundle,
    );
  }

  // The bridge names frames by reference; the session wants one object per frame
  protected contentScriptFrame(
    transport: MessageTransport,
    frameRef: string,
  ): ContentScriptFrame {
    return {
      id: frameRef,
      isMainFrame: transport.isMainFrame(frameRef),
      send: (message: object): Promise<void> =>
        transport.sendToContentScript(frameRef, message),
      evalInMainWorld: (code: string): Promise<unknown> =>
        transport.evalInMainWorld(frameRef, code),
    };
  }

  protected async openSite(page: Page, url: string): Promise<void> {
    try {
      // autoconsent starts with the document, so there's no need to wait for more than the commit
      await page.goto(url, {
        waitUntil: 'commit',
        timeout: NAVIGATION_TIMEOUT_MS,
      });
    } catch (error: unknown) {
      this.ensureBrowserConnected(page, error);

      throw new SiteUnreachableError(url, error);
    }
  }

  // A browser that went away makes everything fail or time out, which says nothing about the Site
  protected ensureBrowserConnected(page: Page, cause?: unknown): void {
    if (!page.context().browser()?.isConnected()) {
      throw new BrowserUnavailableError(
        cause ?? new Error('The browser disconnected during the stock check'),
      );
    }
  }
}
