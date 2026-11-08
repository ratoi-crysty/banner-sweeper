import { Injectable } from '@nestjs/common';
import type { Frame, Page } from 'playwright';
import { RunnerService, type AutoConsentCMPRule, type AutoConsentRuleStep } from '../runner';
import type { SelectorCheck, ValidateRuleRequest, ValidationResult } from './types';

const toLocatorSel = (s: string) => (s.startsWith('xpath/') ? `xpath=${s.slice(6)}` : s);

/** Runs one rule through the real autoconsent engine on a fresh page load and judges the outcome. */
@Injectable()
export class ValidatorService {
  constructor(private readonly runner: RunnerService) {}

  async validate({ url, rule, timeoutMs = 25000, context }: ValidateRuleRequest): Promise<ValidationResult> {
    let selectorChecks: SelectorCheck[] = [];
    let bannerVisibleAfter: boolean | null = null;
    const container = typeof rule.detectPopup[0]?.visible === 'string' ? rule.detectPopup[0].visible : null;

    const snapshot = async (page: Page) => {
      const frames = ruleFrames(page, rule);
      selectorChecks = [];
      for (const s of selectorsOf(rule)) selectorChecks.push({ ...s, ...(await checkSelector(frames, s.selector)) });
    };

    const report = await this.runner.run({ url, timeoutMs, context }, { autoconsent: [rule] }, {
      onPopup: snapshot,
      afterRun: async (page, r) => {
        if (!r.popupFound) await snapshot(page); // explain why detection failed
        await page.waitForTimeout(800);
        if (isFrameRule(rule)) {
          let visible = false;
          for (const f of ruleFrames(page, rule)) {
            visible ||= (await (await f.frameElement().catch(() => null))?.isVisible().catch(() => false)) ?? false;
          }
          bannerVisibleAfter = visible;
        } else if (container) {
          bannerVisibleAfter = (await checkSelector([page.mainFrame()], container)).visible > 0;
        }
      },
    });

    const passed =
      !report.blocked &&
      report.cmpDetected === rule.name &&
      report.popupFound &&
      report.optOutResult === true &&
      report.selfTestResult !== false &&
      bannerVisibleAfter !== true;

    return { passed, report, bannerVisibleAfter, selectorChecks, feedback: feedback(passed, report, bannerVisibleAfter, selectorChecks) };
  }
}

function feedback(passed: boolean, report: ValidationResult['report'], bannerVisibleAfter: boolean | null, checks: SelectorCheck[]): string {
  const lines: string[] = [];
  if (report.blocked) {
    lines.push(`BLOCKED: the site served an error/challenge page on the validation load (${report.blocked}). Not a problem with the rule; retrying may help.`);
  } else if (passed) {
    lines.push('PASSED: autoconsent detected the banner, opted out, and the banner is gone.');
  } else {
    lines.push('FAILED.');
    if (!report.cmpDetected) lines.push('- detectCmp never matched: the detect selector was not found on a fresh page load.');
    else if (!report.popupFound) lines.push('- CMP detected but detectPopup failed: the container was never considered visible.');
    else if (report.optOutResult === false) lines.push('- optOut steps failed: a waitForThenClick selector was not found in time (see checks below).');
    else if (report.optOutResult === null) lines.push('- optOut did not finish within the time budget.');
    if (report.selfTestResult === false) lines.push('- Self-test failed: container still visible after opt-out.');
    if (bannerVisibleAfter) lines.push('- Banner still visible after opt-out (maybe a second layer appeared, or the wrong button was clicked).');
  }
  lines.push('Selector checks on fresh load (count/visible):');
  for (const c of checks) lines.push(`  ${c.role}: ${c.selector} → ${c.count}/${c.visible}`);
  if (checks.some((c) => c.role.startsWith('optOut[') && !c.role.startsWith('optOut[0]'))) {
    lines.push('  (later optOut steps only appear after the earlier clicks, so 0 here can be normal)');
  }
  lines.push(`Timeline: ${report.timeline.join(' → ') || '(no messages: content script did not run)'}`);
  if (report.errors.length) lines.push(`Errors: ${report.errors.join('; ')}`);
  return lines.join('\n');
}

const isFrameRule = (rule: AutoConsentCMPRule) => Boolean(rule.runContext?.frame && rule.runContext.main === false);

function ruleFrames(page: Page, rule: AutoConsentCMPRule): Frame[] {
  if (!isFrameRule(rule)) return [page.mainFrame()];
  const re = new RegExp(rule.runContext?.urlPattern ?? '.');
  return page.frames().filter((f) => f !== page.mainFrame() && re.test(f.url()));
}

async function checkSelector(frames: Frame[], selector: string) {
  let count = 0;
  let visible = 0;
  for (const f of frames) {
    const loc = f.locator(toLocatorSel(selector));
    const n = await loc.count().catch(() => 0);
    count += n;
    for (let i = 0; i < Math.min(n, 5); i++) if (await loc.nth(i).isVisible().catch(() => false)) visible++;
  }
  return { count, visible };
}

function selectorsOf(rule: AutoConsentCMPRule): { selector: string; role: string }[] {
  const out: { selector: string; role: string }[] = [];
  const add = (steps: readonly AutoConsentRuleStep[], role: string) =>
    steps.forEach((s, i) => {
      for (const k of ['exists', 'visible', 'waitForThenClick', 'click', 'waitForVisible', 'hide'] as const) {
        const v = (s as Record<string, unknown>)[k];
        if (typeof v === 'string') out.push({ selector: v, role: `${role}[${i}].${k}` });
      }
    });
  add(rule.detectCmp, 'detectCmp');
  add(rule.detectPopup, 'detectPopup');
  add(rule.optOut, 'optOut');
  return out;
}
