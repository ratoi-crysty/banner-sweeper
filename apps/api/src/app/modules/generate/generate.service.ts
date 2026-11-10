import { Injectable, Logger } from '@nestjs/common';
import type { BrowserContext, Page } from 'playwright-core';
import {
  AgentProviderFactory,
  AgentService,
  browserActions,
  type Action,
  type AgentProvider,
  type AgentStep,
} from '../agent';
import { PlaywrightService } from '../playwright';
import { RunnerService, type AutoConsentCMPRule, AutoconsentRunReport } from '../runner';
import { ValidatorService, type ValidationResult } from '../validator';
import { GENERATE_SYSTEM_PROMPT, RULE_SPEC_SCHEMA, blockedHint } from './generate.prompts';
import { buildRule, ruleNameFor } from './rule-builder';
import type { GenerateRuleRequest, GenerateRuleResult, RuleSpec } from './types';
import { RuleBundle } from '@duckduckgo/autoconsent';

export interface GenerateCallbacks {
  onLog?: (message: string) => void;
  onStep?: (step: AgentStep) => void;
  signal?: AbortSignal;
}

/**
 * The glue: bundled-rules shortcut (runner) → LLM exploration (agent + playwright) →
 * test_rule on fresh loads (validator) → a rule that already passed the real engine.
 */
@Injectable()
export class GenerateService {
  private readonly logger = new Logger(GenerateService.name);

  constructor(
    private readonly playwright: PlaywrightService,
    private readonly runner: RunnerService,
    private readonly validator: ValidatorService,
    private readonly agent: AgentService,
    private readonly providers: AgentProviderFactory,
  ) {}

  async generate(request: GenerateRuleRequest, cb: GenerateCallbacks = {}): Promise<GenerateRuleResult> {
    const { url, settleMs = 2500, context: contextSettings } = request;
    const log = (m: string) => {
      this.logger.debug(m);
      cb.onLog?.(m);
    };
    const name = request.name ?? ruleNameFor(url);

    // 1) autoconsent may already know this CMP.
    if (request.checkBundledRules !== false) {
      log('Checking autoconsent bundled rules…');
      const bundledRules: RuleBundle = await this.runner.getRuleBundle();
      console.log('Get rule bundle', bundledRules);
      const report: AutoconsentRunReport = await this.runner.run(
        { url, timeoutMs: 20000, context: contextSettings },
        bundledRules,
      );

      if (report.blocked) return { status: 'blocked', summary: blockedHint(report.blocked), steps: [] };
      if (report.cmpDetected && report.popupFound && report.optOutResult) {
        return {
          status: 'covered-by-bundled-rule',
          cmp: report.cmpDetected,
          summary: `Already handled by bundled autoconsent rule "${report.cmpDetected}".`,
          steps: [],
        };
      }
      log(`Bundled rules: ${report.timeline.join(' → ') || 'nothing detected'}`);
    }
    if (cb.signal?.aborted) return { status: 'cancelled', summary: 'Cancelled.', steps: [] };

    // 2) Exploration page in its own context, so reset_page can start from a clean state.
    let context: BrowserContext | undefined;
    let page!: Page;
    const openFresh = async () => {
      await context?.close().catch(() => {
        // do nothing
      });
      context = await this.playwright.newContext(contextSettings);
      page = await context.newPage();
      const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(settleMs);
      return this.playwright.detectBlock(page, response);
    };

    let lastTested: { rule: AutoConsentCMPRule; validation: ValidationResult } | undefined;
    let passing: typeof lastTested;

    const ruleActions: Record<string, Action> = {
      reset_page: {
        definition: {
          name: 'reset_page',
          description:
            'Reload the page in a fresh browser context (no cookies), so the banner is back in its initial state.',
          parameters: { type: 'object', properties: {} },
        },
        run: async () => {
          const b = await openFresh();
          return b.blocked
            ? {
                text: `The site blocked this load (${b.reason}). Call done(success=false, summary="blocked").`,
                isError: true,
              }
            : { text: 'Page reloaded fresh. Call inspect_page.' };
        },
      },
      test_rule: {
        definition: {
          name: 'test_rule',
          description:
            'Build an autoconsent rule from the spec and run it with the real autoconsent engine on a fresh page load.',
          parameters: RULE_SPEC_SCHEMA,
        },
        run: async (_ctx, spec: RuleSpec) => {
          let rule: AutoConsentCMPRule;
          try {
            if (typeof spec.optOutClicks === 'string') spec.optOutClicks = [spec.optOutClicks]; // small-model slip
            rule = buildRule(spec, url, name);
          } catch (e) {
            return { text: `Invalid spec: ${(e as Error).message}`, isError: true };
          }
          log(`Testing rule: ${JSON.stringify(spec)}`);
          const validation = await this.validator.validate({ url, rule, context: contextSettings });
          lastTested = { rule, validation };
          if (validation.passed) passing = lastTested;
          return { text: validation.feedback, isError: !validation.passed };
        },
      },
    };

    try {
      const first = await openFresh();
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (first.blocked) return { status: 'blocked', summary: blockedHint(first.reason!), steps: [] };

      const provider: AgentProvider = this.providers.create(request.provider);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { navigate, take_screenshot, ...explore } = browserActions;
      // Screenshots only help providers whose model sees images.
      const actions = { ...explore, ...ruleActions, ...(provider.vision ? { take_screenshot } : {}) };

      const result = await this.agent.run(`Write an autoconsent rule for ${url}.`, {
        page: () => page,
        provider,
        system: GENERATE_SYSTEM_PROMPT,
        actions,
        maxSteps: request.maxSteps ?? 20,
        onStep: cb.onStep,
        signal: cb.signal,
      });

      if (passing) return { status: 'generated', ...passing, steps: result.steps, summary: result.summary };
      if (result.cancelled) return { status: 'cancelled', summary: 'Cancelled.', steps: result.steps, ...lastTested };
      if (/\bblocked\b/i.test(result.summary))
        return { status: 'blocked', summary: blockedHint(result.summary), steps: result.steps };
      const noBanner = /no banner/i.test(result.summary);
      return { status: noBanner ? 'no-banner' : 'failed', summary: result.summary, steps: result.steps, ...lastTested };
    } finally {
      await context?.close().catch(() => {
        // do nothing
      });
    }
  }
}
