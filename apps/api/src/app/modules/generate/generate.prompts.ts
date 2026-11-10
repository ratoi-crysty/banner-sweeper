import type { JsonSchema } from '../agent';

export const GENERATE_SYSTEM_PROMPT = `You write DuckDuckGo autoconsent rules that close cookie banners by REJECTING non-essential cookies.
You explore a live page with tools, then call test_rule. test_rule loads the page fresh and runs the real autoconsent engine with your rule.

Procedure:
1. inspect_page. Find the banner CONTAINER and its buttons. Use the css=… values exactly as given; never invent selectors.
2. Find a reject option ("Reject all", "Decline", "Only necessary", "Refuse", "Ablehnen", "Refuser", "Rifiuta", "Refuză"…).
   - If the first layer has none, click "Settings"/"Manage options"/"Customize" (by ref), inspect_page again, and look for "Reject all" or a "Save"/"Confirm choices" button (non-essential toggles are usually off by default). Then the optOutClicks are [settings button css, reject/save css].
   - Use reset_page to get back to a fresh banner if you clicked something wrong.
3. Call test_rule with:
   containerSelector = the banner container css (prefer an id/data-attribute selector, not xpath),
   optOutClicks = selectors to click in order,
   optInClick = the accept button css if visible,
   frameUrl = the iframe url if the buttons were listed under an "-- iframe url=… --" line (container must then be inside that iframe too).
4. If test_rule FAILED, read the feedback, fix the spec and test again.
5. When test_rule PASSED, call done(success=true). If there is no cookie banner, call done(success=false, summary="no banner").
   If the page is an error page, an "access denied" page or a bot check instead of the real site, call done(success=false, summary="blocked: <what you saw>").
   Only if no reject/save path exists anywhere, use cosmetic=true (just hides the banner).
One tool call per turn.`;

export const RULE_SPEC_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    containerSelector: { type: 'string', description: 'css of the banner container (from inspect_page).' },
    detectSelector: {
      type: 'string',
      description:
        'Optional: more specific selector proving this CMP exists (e.g. the reject button). Defaults to the container.',
    },
    optOutClicks: { type: 'array', items: { type: 'string' }, description: 'Selectors to click in order to reject.' },
    optInClick: { type: 'string', description: 'Accept button selector (optional).' },
    frameUrl: {
      type: 'string',
      description: 'Only if the banner is inside an iframe: the iframe url from inspect_page.',
    },
    cosmetic: {
      type: 'boolean',
      description: 'true only if there is no way to reject: the rule just hides the banner.',
    },
  },
  required: ['containerSelector', 'optOutClicks'],
};

export const blockedHint = (reason: string) =>
  `Site blocked the automated browser: ${reason}. Try a headed browser / real Chrome (PlaywrightModule headless: false, channel: 'chrome'), a local locale/timezone in the request context, or a different network (datacenter IPs are often blocked).`;
