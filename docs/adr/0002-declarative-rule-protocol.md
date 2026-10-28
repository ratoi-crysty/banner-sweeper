---
status: superseded by ADR-0007 for Consent Banners; parked for Content Overlays
---

# Rules are declarative data built from generic primitives, never code

A Rule is JSON: a Match plus an ordered list of Steps. Each Step is a generic DOM or storage primitive from a closed set; there are no expressions, loops, conditionals beyond `waitFor`, or string-to-code paths (`eval`, `new Function`, injected `<script>`). We chose this over shipping JS snippets because MV3 and Chrome Web Store policy forbid remotely hosted code, because Detection output must be machine-checkable before anyone runs it, and because a fixed vocabulary is what makes Verification and Admin review meaningful.

The `op` vocabulary is deliberately generic, with no pattern-specific macros:

| op                               | Effect                                                       |
| -------------------------------- | ------------------------------------------------------------ |
| `storage.set` / `storage.remove` | localStorage or sessionStorage key                           |
| `cookie.set` / `cookie.remove`   | one cookie (via `chrome.cookies`, so HttpOnly works)         |
| `waitFor`                        | wait until a selector matches, with a timeout                |
| `click`                          | click the matched element                                    |
| `remove`                         | remove the matched element                                   |
| `attr.set` / `attr.remove`       | one attribute                                                |
| `class.add` / `class.remove`     | one class                                                    |
| `style.set` / `style.remove`     | one property in the `style` attribute, optional `!important` |
| `css.inject`                     | a stylesheet rule: selector + declarations                   |

Common patterns are compositions, not ops. Releasing a Scroll Lock is `style.set` of `overflow: auto` on `html` and `body` (or `class.remove` of the site's lock class); hiding an Obstruction is `css.inject` with `display: none !important`.

## Considered Options

- **Intent-level ops** (`scroll.unlock`, `hide`, `decline`). Shorter Rules, but each one hides a custom implementation in the executor, and every new site quirk pressures us to add or special-case a macro. Rejected.

## Consequences

- Adding a primitive means changing `libs/api-interfaces`, bumping `RULE_PROTOCOL_VERSION`, and releasing the extension; the server cannot unlock new behaviour on its own. This is deliberate, and with generic primitives it should be rare. Each Rule carries the protocol version it was written against, and extensions skip Rules newer than they support.
- If authoring convenience is needed (a "release scroll lock" button in the Admin editor, a pattern Detection can name), it is a template that expands into primitives at authoring time; the stored Revision only ever contains primitives.
- The vocabulary must stay narrow enough that it does not become a general-purpose interpreter, which would undercut the policy argument above.
- Selectors are a path of CSS selectors, each one after the first resolved inside the previous match's shadow root, since several CMPs render inside shadow DOM. A Match only selects top-level pages; each Step can target frames by their own host, since several CMPs render in cross-origin iframes and one Rule may need to act both inside the iframe and on the page.
- `attr.set` / `attr.remove` cannot touch inline event handlers (`on*`), URL-bearing attributes (`src`, `href`, `srcdoc`, `action`, …), or `style` / `class`, which have their own ops. `style.set` obeys the same declaration rules as `css.inject`. Both checks live in `libs/api-interfaces` so the API and the extension enforce the same rules.
- `css.inject` is the only op that does not edit a matched element: the browser applies it to every current and future match, so it hides an Obstruction before it paints and survives framework re-renders, which inline edits cannot. See below.

## `css.inject`

```jsonc
{ "op": "css.inject", "selector": "#onetrust-banner-sdk, .meter-modal", "declarations": [{ "property": "display", "value": "none", "important": true }] }
```

- **Delivered with `chrome.scripting.insertCSS({ origin: 'USER' })`** from the background worker, into the frames the Step targets. It is invisible to the page and the page cannot remove it, and user-origin `!important` declarations win the cascade over everything the page sets, including inline `!important`. Chosen over a content-script `<style>` element, which has guaranteed `document_start` timing but which the page can see, remove, or outrank. Accepted risk: the round-trip through the background worker may land after first paint and cause a brief flash. If a prototype shows this is common, we will revisit how the CSS is delivered, not the op.
- **Declarations are structured, never raw CSS text.** The schema rejects `url(`, `@`, `{`, `}` and `;` in values, so a Rule cannot inject extra rules, `@import`, or make the page fetch a URL (which would leak browsing). Properties are limited to an allow-list (`display`, `visibility`, `overflow`, `position`, `pointer-events`, `opacity`, `height`, `max-height`, `filter`, `z-index`, …).
- **It only changes how things look.** It cannot Decline a Consent Banner; that needs `click` or storage/cookie Steps.
- **It does not reach inside shadow roots.** It can hide a shadow host, but not style anything inside it.
- The extension needs the `scripting` permission and host permissions for the Sites it acts on.
- Detection asks the LLM for a Rule in this schema; anything that does not validate is discarded rather than repaired by hand-written code.
