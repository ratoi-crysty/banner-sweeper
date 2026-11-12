import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { Config, RuleBundle, ContentScriptMessage } from '@duckduckgo/autoconsent';
import { Frame, Page, Response } from 'playwright-core';
import { BlockInfo, PlaywrightService } from '../playwright';
import type { AutoconsentRunReport, RunRequest } from './types/runner.types';

/** BE-only hooks (they receive a live Playwright Page). */
export interface RunHooks {
  /** Called when the popup is found, before opt-out is triggered. */
  onPopup?: (page: Page) => Promise<void>;
  /** Called after opt-out finished, with the page still open. */
  afterRun?: (page: Page, report: AutoconsentRunReport) => Promise<void>;
}

type Target = { send: (m: object) => Promise<unknown>; evalInMainWorld: (code: string) => Promise<unknown> };
type Inject = (
  page: Page,
  factory: (t: unknown) => (msg: ContentScriptMessage, ref: string) => Promise<void>,
  script: string,
) => Promise<void>;

// webpack rewrites `require.resolve()` and `import()` at build time (into module ids / its own chunk loader),
// so these files on disk must be located and loaded through Node itself.
const nodeRequire: NodeJS.Require = createRequire(__filename);
const nodeImport = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<{ injectIntoIsolatedWorld: Inject }>;

/**
 * Runs the real autoconsent content script against a URL in a fresh browser context, the way the
 * extension does (isolated world on Chromium), and reports the message flow.
 */
@Injectable()
export class RunnerService implements OnModuleInit {
  protected logger = new Logger(RunnerService.name);
  private contentScript!: string;
  private isolatedInjector!: Promise<Inject | undefined>;
  private bundled?: RuleBundle;
  // The package "exports" hides these files, so locate them on disk.
  private readonly root = path.resolve(path.dirname(nodeRequire.resolve('@duckduckgo/autoconsent')), '..');

  constructor(private readonly playwright: PlaywrightService) {}

  async onModuleInit(): Promise<void> {
    this.contentScript = await readFile(path.join(this.root, 'dist/autoconsent.playwright.js'), 'utf8');

    this.isolatedInjector = nodeImport(pathToFileURL(path.join(this.root, 'playwright/isolated-world.mjs')).href)
      .then((m): Inject => m.injectIntoIsolatedWorld as Inject)
      .catch((e: unknown): undefined => {
        this.logger.warn('Failed initializing isolated world', e);
      });
  }

  /** autoconsent's bundled rule set (hundreds of known CMPs). */
  async getRuleBundle(): Promise<RuleBundle> {
    if (!this.bundled) {
      const rulesBody = await readFile(nodeRequire.resolve('@duckduckgo/autoconsent/rules/rules.json'));

      this.bundled = JSON.parse(rulesBody.toString()) as RuleBundle;
    }

    return this.bundled;
  }

  async run(request: RunRequest, rules: RuleBundle, hooks: RunHooks = {}): Promise<AutoconsentRunReport> {
    const { url, timeoutMs = 25000 } = request;

    const report: AutoconsentRunReport = {
      cmpDetected: null,
      popupFound: false,
      optOutResult: null,
      selfTestResult: null,
      done: false,
      errors: [],
      timeline: [],
    };

    const context = await this.playwright.newContext(request.context); // fresh cookies → banner shows again
    const page = await context.newPage();

    let resolveFinished: () => void;

    const finished = new Promise<void>((resolve) => (resolveFinished = resolve));

    let selfTestTarget: Target | null = null;
    let optOutSent = false;

    const onMessage = async (msg: ContentScriptMessage, target: Target) => {
      report.timeline.push(msg.type + ('cmp' in msg ? `(${msg.cmp})` : '') + ('result' in msg ? `=${msg.result}` : ''));

      switch (msg.type) {
        case 'init':
          await target.send({ type: 'initResp', rules, config: validationConfig() });
          break;
        case 'cmpDetected':
          report.cmpDetected ??= msg.cmp;
          break;
        case 'popupFound':
          report.popupFound = true;
          if (!optOutSent) {
            optOutSent = true;
            await hooks.onPopup?.(page).catch(() => {
              // do nothing
            });
            await target.send({ type: 'optOut' });
          }
          break;
        case 'optOutResult':
          report.optOutResult = Boolean(msg.result);
          if (msg.scheduleSelfTest) selfTestTarget = target;
          if (!msg.result) resolveFinished();
          break;
        case 'autoconsentDone':
          report.done = true;
          if (selfTestTarget) await selfTestTarget.send({ type: 'selfTest' });
          else resolveFinished();
          break;
        case 'selfTestResult':
          report.selfTestResult = Boolean(msg.result);
          resolveFinished();
          break;
        case 'eval': {
          let result: unknown = false;
          try {
            result = await target.evalInMainWorld(msg.code);
          } catch {
            // TODO: Investigate this
          }
          await target.send({ id: msg.id, type: 'evalResp', result });
          break;
        }
        case 'autoconsentError':
          report.errors.push(JSON.stringify(msg.details ?? msg).slice(0, 300));
          break;
      }
    };

    try {
      await this.inject(page, onMessage);

      const response: Response | null = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      const block: BlockInfo = await this.playwright.detectBlock(page, response);

      if (block.blocked) {
        report.blocked = block.reason;
        return report;
      }

      await Promise.race([finished, page.waitForTimeout(timeoutMs)]);
      if (selfTestTarget && report.selfTestResult === null) await Promise.race([finished, page.waitForTimeout(4000)]);
      await hooks.afterRun?.(page, report);
    } catch (err) {
      report.errors.push((err as Error).message.split('\n')[0] ?? '');
    } finally {
      await context.close().catch(() => {
        // do nothing
      });
    }
    return report;
  }

  private async inject(
    page: Page,
    onMessage: (msg: ContentScriptMessage, target: Target) => Promise<void>,
  ): Promise<void> {
    const browserName: string = await this.playwright.browserName();
    const inject = browserName === 'chromium' ? await this.isolatedInjector : undefined;

    if (inject) {
      await inject(
        page,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (t: any) => async (msg, ref) =>
          onMessage(msg, {
            send: (m) => t.sendToContentScript(ref, m),
            evalInMainWorld: (code) => t.evalInMainWorld(ref, code),
          }),
        this.contentScript,
      );
      return;
    }

    // Fallback: main-world injection (Firefox/WebKit, or if the injector file is missing).
    await page.exposeBinding('autoconsentSendMessage', ({ frame }, msg) =>
      onMessage(msg, {
        send: (m) => frame.evaluate(`autoconsentReceiveMessage(${JSON.stringify(m)})`),
        evalInMainWorld: (code) => frame.evaluate(code),
      }),
    );
    const injectFrame = (f: Frame) =>
      f.evaluate(this.contentScript).catch(() => {
        // do nothing
      });
    page.on('framenavigated', injectFrame);
    page.on('domcontentloaded', () => page.frames().forEach(injectFrame));
  }
}

/** Run only the rules we pass in; we trigger opt-out ourselves (after onPopup). */
function validationConfig(): Config {
  return {
    enabled: true,
    autoAction: null,
    disabledCmps: [],
    enablePrehide: false,
    enableCosmeticRules: true,
    enableGeneratedRules: false,
    enableHeuristicDetection: false,
    enablePopupMutationObserver: false,
    detectRetries: 20,
    isMainWorld: false,
    prehideTimeout: 2000,
    visualTest: false,
    performanceLoggingEnabled: false,
    heuristicPopupSearchTimeout: 100,
    enableHeuristicHitTest: false,
    heuristicMode: 'off',
    logs: {
      lifecycle: false,
      rulesteps: false,
      detectionsteps: false,
      evals: false,
      errors: false,
      messages: false,
      waits: false,
    },
  };
}
