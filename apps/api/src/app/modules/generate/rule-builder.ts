import type { AutoConsentCMPRule, AutoConsentRuleStep } from '../runner';
import type { RuleSpec } from './types';
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
const isCss = (sel: string) => !sel.startsWith('xpath/');

export function siteUrlPattern(pageUrl: string): string {
  const host = new URL(pageUrl).host.replace(/^www\./, '');
  return `^https?://(www\\.)?${escapeRe(host)}/`;
}

export function frameUrlPattern(frameUrl: string): string {
  const u = new URL(frameUrl);
  return `^${escapeRe(`${u.protocol}//${u.host}`)}/`;
}

/**
 * Note: autoconsent treats names starting with "auto_" as its own generated rules and skips them
 * unless `enableGeneratedRules` is on, so we use a different prefix.
 */
export function ruleNameFor(pageUrl: string): string {
  return `llm_${new URL(pageUrl).hostname.replace(/^www\./, '')}`;
}

/** Turns the agent's RuleSpec into an autoconsent JSON rule. Names must not start with "auto_". */
export function buildRule(spec: RuleSpec, pageUrl: string, name = ruleNameFor(pageUrl)): AutoConsentCMPRule {
  if (name.startsWith('auto_'))
    throw new Error('Rule names starting with "auto_" are skipped by autoconsent unless enableGeneratedRules is on.');
  const c = spec.containerSelector;
  const inFrame = Boolean(spec.frameUrl);
  if (spec.cosmetic && !isCss(c))
    throw new Error('Cosmetic rules need a CSS containerSelector (hide does not support xpath).');
  if (!spec.cosmetic && !spec.optOutClicks?.length)
    throw new Error('optOutClicks must contain at least one selector (or set cosmetic: true).');

  const click = (sel: string, i: number): AutoConsentRuleStep => ({
    waitForThenClick: sel,
    timeout: i === 0 ? 1000 : 3000,
  });
  const hide: AutoConsentRuleStep[] = isCss(c) ? [{ hide: c }] : [];

  return {
    name,
    vendorUrl: new URL(pageUrl).origin + '/',
    ...(isCss(c) && !inFrame ? { prehideSelectors: [c] } : {}),
    runContext: inFrame
      ? // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        { main: false, frame: true, urlPattern: frameUrlPattern(spec.frameUrl!) }
      : { main: true, frame: false, urlPattern: siteUrlPattern(pageUrl) },
    ...(spec.cosmetic ? { cosmetic: true } : {}),
    detectCmp: [{ exists: spec.detectSelector ?? c }],
    detectPopup: [{ visible: c, check: 'any' }],
    optOut: spec.cosmetic ? hide : spec.optOutClicks.map(click),
    optIn: spec.optInClick ? [click(spec.optInClick, 0)] : hide,
    // The iframe is usually torn down after the click, so a self-test there has nothing to run in.
    ...(inFrame ? {} : { test: [{ waitForVisible: c, check: 'none', timeout: 3000 }] }),
  } satisfies AutoConsentCMPRule;
}
