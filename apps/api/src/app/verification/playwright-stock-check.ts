import { Injectable } from '@nestjs/common';
import type { VerificationReport } from '@banner-sweeper/api-interfaces';
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
import { autoconsentBundle } from './autoconsent-bundle';
import { AutoconsentSession, ContentScriptFrame } from './autoconsent-session';
import {
  ExistingRulesVerdict,
  checkExistingRules,
} from './existing-rules-checks';
import { PublishedRuleSource } from './published-rule-source';
import { SiteUnreachableError } from './site-unreachable.error';
import { StockCheck, StockCheckResult } from './stock-check';

const NAVIGATION_TIMEOUT_MS = 30_000;

/** The stock check in a real browser: one fresh context, the URL only, closed whatever happens. */
@Injectable()
export class PlaywrightStockCheck extends StockCheck {
  constructor(
    private readonly browser: BrowserService,
    private readonly publishedRules: PublishedRuleSource,
  ) {
    super();
  }

  async run(url: string): Promise<StockCheckResult> {
    const published: AutoConsentCMPRule[] = await this.publishedRules.list();
    const context: BrowserContext = await this.browser.newContext();

    try {
      const page: Page = await context.newPage();
      // The extension's exact config: heuristics (tier1/tier2) stay off
      const session: AutoconsentSession = new AutoconsentSession({
        config: autoconsentConfig,
        rulesForFrame: (frame: FrameContext): RuleBundle => ({
          autoconsent: published,
          compact: compactRulesForFrame(frame),
        }),
      });
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
        autoconsentBundle(),
      );
      await this.openSite(page, url);

      const verdict: ExistingRulesVerdict = await checkExistingRules(session);

      // A browser that went away mid-run makes the waits time out, which says nothing about the Site
      if (!context.browser()?.isConnected()) {
        throw new BrowserUnavailableError(
          new Error('The browser disconnected during the stock check'),
        );
      }

      const report: VerificationReport = {
        checks: verdict.checks,
        timings: {
          totalMs: session.elapsedMs(),
          detectedMs: verdict.detectedMs,
          declinedMs: verdict.declinedMs,
        },
        messageLog: session.messageLog(),
        popupFrameUrl: verdict.popupFrameUrl,
      };

      return verdict.covered
        ? { covered: true, coveredBy: verdict.coveredBy, report }
        : {
            covered: false,
            notCoveredReason: verdict.notCoveredReason,
            report,
          };
    } finally {
      await context.close().catch((): void => undefined);
    }
  }

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
      if (!page.context().browser()?.isConnected()) {
        throw new BrowserUnavailableError(error);
      }

      throw new SiteUnreachableError(url, error);
    }
  }

}
