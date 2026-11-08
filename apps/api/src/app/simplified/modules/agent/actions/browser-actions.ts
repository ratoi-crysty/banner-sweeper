import type { Frame, Locator, Page } from 'playwright';
import type { ToolDefinition, ToolResult } from '../types';

/**
 * The instruction set the agent can give to Playwright.
 * Each action = a JSON-schema tool definition + a handler.
 *
 * Elements are addressed either by a `ref` (returned from `inspect_page`, most reliable
 * for small models) or by a CSS `selector`. Both are searched across all frames,
 * because many consent banners (Sourcepoint, TrustArc…) live inside iframes.
 */

export interface ActionContext {
  page: Page;
  /** Default timeout for waits/clicks, ms. */
  timeout: number;
}

export interface Action {
  definition: ToolDefinition;
  run(ctx: ActionContext, args: any): Promise<ToolResult>;
}

const REF_ATTR = 'data-llm-ref';

const target = {
  ref: { type: 'string', description: 'Element ref from inspect_page, e.g. "e12". Preferred.' },
  selector: { type: 'string', description: 'CSS selector (or "xpath/…"). Use when you have no ref.' },
};

/** Find the first frame that contains a match and return a locator for it. */
async function resolve(page: Page, args: { ref?: string; selector?: string }): Promise<Locator> {
  const css = args.ref ? `[${REF_ATTR}="${args.ref}"]` : args.selector;
  if (!css) throw new Error('Provide "ref" or "selector".');
  for (const frame of page.frames()) {
    const loc = frame.locator(css.startsWith('xpath/') ? `xpath=${css.slice(6)}` : css).first();
    if ((await loc.count().catch(() => 0)) > 0) return loc;
  }
  throw new Error(`No element matches ${args.ref ? `ref ${args.ref}` : `selector "${css}"`}.`);
}

/**
 * Runs inside each frame: tags visible interactive/banner-ish elements with refs and
 * computes a stable selector (css=…) for each, usable in an autoconsent rule.
 * Kept as a plain JS string on purpose: bundlers like tsx/esbuild inject helpers
 * (e.g. `__name`) into TS functions, which don't exist in the browser.
 * (No backticks or dollar-brace sequences allowed inside.)
 */
const SNAPSHOT_SCRIPT = String.raw`({ attr, startId, maxItems }) => {
  // continue numbering after refs left by earlier inspections, so refs never collide
  let id = startId;
  document.querySelectorAll('[' + attr + ']').forEach((el) => { id = Math.max(id, Number(el.getAttribute(attr).slice(1)) + 1); });
  const out = [];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0;
  };
  const clean = (t) => (t || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const esc = (v) => CSS.escape(v);
  const unique = (sel) => { try { return document.querySelectorAll(sel).length === 1; } catch (e) { return false; } };
  // ids/classes that look generated (hashes, framework prefixes) break on the next deploy
  const randomish = (v) => /\d{4,}|[a-f0-9]{8,}|^(ember|react-|ng-|css-|sc-|jsx-|svelte-|_)/i.test(v) || v.length > 40;

  const stableSelector = (el) => {
    const tag = el.tagName.toLowerCase();
    if (el.id && !randomish(el.id) && unique('#' + esc(el.id))) return '#' + esc(el.id);
    const attrs = ['data-testid', 'data-test', 'data-qa', 'data-cy', 'data-role', 'data-action', 'data-tracking-opt-in-reject', 'name', 'aria-label', 'title'];
    for (const a of attrs) {
      const v = el.getAttribute(a);
      if (v && v.length < 60 && !randomish(v) && v.indexOf('"') < 0) {
        const sel = tag + '[' + a + '="' + v + '"]';
        if (unique(sel)) return sel;
      }
    }
    const classes = Array.from(el.classList).filter((c) => !randomish(c));
    for (const c of classes) { const sel = tag + '.' + esc(c); if (unique(sel)) return sel; }
    if (classes.length > 1) { const sel = tag + classes.map((c) => '.' + esc(c)).join(''); if (unique(sel)) return sel; }
    // scope by the closest ancestor with a stable id
    for (let anc = el.parentElement; anc && anc !== document.body; anc = anc.parentElement) {
      if (anc.id && !randomish(anc.id)) {
        const base = '#' + esc(anc.id) + ' ';
        for (const c of classes) { const sel = base + tag + '.' + esc(c); if (unique(sel)) return sel; }
        const kids = Array.from(anc.querySelectorAll(tag));
        if (kids.length <= 6) {
          const sel = base + tag + ':nth-of-type(' + (Array.from(el.parentElement.children).filter((k) => k.tagName === el.tagName).indexOf(el) + 1) + ')';
          if (unique(sel) && document.querySelector(sel) === el) return sel;
        }
        break;
      }
    }
    // last resort: exact visible text (language-dependent)
    const text = clean(el.innerText);
    if (text && text.length < 40 && text.indexOf('"') < 0) {
      const xp = '//' + tag + '[normalize-space(.)="' + text + '"]';
      const n = document.evaluate(xp, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null).snapshotLength;
      if (n === 1) return 'xpath/' + xp;
    }
    return null;
  };

  // 1) Likely banner containers (helps the model orient itself).
  const bannerRe = /cookie|consent|gdpr|privacy|cmp|onetrust|didomi|usercentrics|cookiebot|truste|sp_message|qc-cmp/i;
  const containers = Array.from(document.querySelectorAll('div,section,aside,dialog,form,[role=dialog]'))
    .filter((el) => bannerRe.test(el.id + ' ' + el.className + ' ' + (el.getAttribute('aria-label') || '')) && visible(el))
    .filter((el, _, all) => !all.some((o) => o !== el && o.contains(el)))
    .slice(0, 5);
  for (const el of containers) {
    const ref = el.getAttribute(attr) || 'e' + id++;
    el.setAttribute(attr, ref);
    const css = stableSelector(el);
    out.push('[' + ref + '] CONTAINER <' + el.tagName.toLowerCase() + '>' + (css ? ' css=' + css : '') + ' "' + clean(el.innerText).slice(0, 120) + '"');
  }

  // 2) Clickable elements, banner-related ones first.
  const clickables = Array.from(
    document.querySelectorAll('button,a,[role=button],input[type=button],input[type=submit],[onclick]'),
  ).filter(visible);
  const inBanner = (el) => containers.some((c) => c.contains(el));
  clickables.sort((a, b) => Number(inBanner(b)) - Number(inBanner(a)));
  for (const el of clickables) {
    if (out.length >= maxItems) break;
    const label = clean(el.innerText || el.value || el.getAttribute('aria-label') || el.title);
    if (!label) continue;
    const ref = el.getAttribute(attr) || 'e' + id++;
    el.setAttribute(attr, ref);
    const css = inBanner(el) || out.length < 25 ? stableSelector(el) : null;
    out.push('[' + ref + '] ' + el.tagName.toLowerCase() + (inBanner(el) ? ' (in banner)' : '') + ' "' + label + '"' + (css ? ' css=' + css : ''));
  }
  return { lines: out, nextId: id };
}`;

/** The built-in browser instruction set. Extend or restrict per run via AgentRunOptions.actions. */
export const browserActions: Record<string, Action> = {
  navigate: {
    definition: {
      name: 'navigate',
      description: 'Go to a URL.',
      parameters: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    },
    async run({ page, timeout }, { url }) {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeout * 3 });
      return { text: `Navigated to ${page.url()}` };
    },
  },

  inspect_page: {
    definition: {
      name: 'inspect_page',
      description:
        'List visible clickable elements (and likely cookie/consent containers) across all frames. Each has a ref for click/scroll, and usually css=<stable selector> for use in rules. Call this first.',
      parameters: { type: 'object', properties: { maxItems: { type: 'number', description: 'Default 60.' } } },
    },
    async run({ page }, { maxItems = 60 }) {
      const lines: string[] = [];
      let nextId = 1;
      for (const frame of page.frames()) {
        const res = await frame
          // String expression → sent via CDP, so it also works on pages with a strict CSP.
          .evaluate<{ lines: string[]; nextId: number }>(
            `(${SNAPSHOT_SCRIPT})(${JSON.stringify({ attr: REF_ATTR, startId: nextId, maxItems: maxItems - lines.length })})`,
          )
          .catch(() => null); // detached / cross-origin-blocked frames
        if (!res) continue;
        nextId = res.nextId;
        if (res.lines.length) {
          if (frame !== page.mainFrame()) lines.push(`-- iframe url=${frame.url().slice(0, 200)} --`);
          lines.push(...res.lines);
        }
        if (lines.length >= maxItems) break;
      }
      return { text: lines.length ? lines.join('\n') : 'No visible interactive elements found.' };
    },
  },

  wait_for_selector: {
    definition: {
      name: 'wait_for_selector',
      description: 'Wait until a CSS selector is visible (or hidden) in any frame.',
      parameters: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          state: { type: 'string', enum: ['visible', 'hidden', 'attached', 'detached'] },
          timeoutMs: { type: 'number' },
        },
        required: ['selector'],
      },
    },
    async run({ page, timeout }, { selector, state = 'visible', timeoutMs = timeout }) {
      const tryFrame = (f: Frame) => f.waitForSelector(selector, { state, timeout: timeoutMs }).then(() => f);
      try {
        // Hidden/detached must hold in the main frame; visible/attached in any frame.
        const frame =
          state === 'hidden' || state === 'detached' ? await tryFrame(page.mainFrame()) : await Promise.any(page.frames().map(tryFrame));
        return { text: `"${selector}" is ${state}${frame !== page.mainFrame() ? ' (in iframe)' : ''}.` };
      } catch {
        return { text: `Timed out waiting for "${selector}" to be ${state}.`, isError: true };
      }
    },
  },

  click: {
    definition: {
      name: 'click',
      description: 'Click an element by ref or CSS selector.',
      parameters: { type: 'object', properties: { ...target } },
    },
    async run({ page, timeout }, args) {
      const loc = await resolve(page, args);
      await loc.scrollIntoViewIfNeeded({ timeout }).catch(() => {});
      await loc.click({ timeout });
      await page.waitForTimeout(500); // let banners animate out
      return { text: `Clicked ${args.ref ?? args.selector}.` };
    },
  },

  click_text: {
    definition: {
      name: 'click_text',
      description: 'Click the first visible button/link whose text matches (case-insensitive), in any frame.',
      parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    },
    async run({ page, timeout }, { text }) {
      const re = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      for (const frame of page.frames()) {
        const loc = frame.getByRole('button', { name: re }).or(frame.getByRole('link', { name: re })).first();
        if (await loc.isVisible().catch(() => false)) {
          await loc.click({ timeout });
          await page.waitForTimeout(500);
          return { text: `Clicked element with text "${text}".` };
        }
      }
      return { text: `No visible button/link with text "${text}".`, isError: true };
    },
  },

  scroll: {
    definition: {
      name: 'scroll',
      description: 'Scroll the page (direction + pixels) or scroll an element into view (ref/selector).',
      parameters: {
        type: 'object',
        properties: { direction: { type: 'string', enum: ['up', 'down'] }, pixels: { type: 'number' }, ...target },
      },
    },
    async run({ page, timeout }, args) {
      if (args.ref || args.selector) {
        await (await resolve(page, args)).scrollIntoViewIfNeeded({ timeout });
        return { text: `Scrolled ${args.ref ?? args.selector} into view.` };
      }
      const dy = (args.direction === 'up' ? -1 : 1) * (args.pixels ?? 600);
      await page.mouse.wheel(0, dy);
      return { text: `Scrolled ${dy > 0 ? 'down' : 'up'} ${Math.abs(dy)}px.` };
    },
  },

  press_key: {
    definition: {
      name: 'press_key',
      description: 'Press a keyboard key, e.g. "Escape" or "Enter".',
      parameters: { type: 'object', properties: { key: { type: 'string' } }, required: ['key'] },
    },
    async run({ page }, { key }) {
      await page.keyboard.press(key);
      return { text: `Pressed ${key}.` };
    },
  },

  take_screenshot: {
    definition: {
      name: 'take_screenshot',
      description: 'Screenshot the current viewport. Only useful if you can see images.',
      parameters: { type: 'object', properties: {} },
    },
    async run({ page }) {
      const buf = await page.screenshot({ type: 'png' });
      return { text: 'Screenshot taken.', imageBase64: buf.toString('base64') };
    },
  },

  done: {
    definition: {
      name: 'done',
      description: 'Finish the task. Call when the goal is reached or cannot be reached.',
      parameters: {
        type: 'object',
        properties: { success: { type: 'boolean' }, summary: { type: 'string' } },
        required: ['success', 'summary'],
      },
    },
    async run(_ctx, { summary }) {
      return { text: summary };
    },
  },
};

export type BrowserActionName = keyof typeof browserActions;
