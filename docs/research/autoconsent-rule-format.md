# How our own Rules work inside autoconsent

Research for [#7](https://github.com/ratoi-crysty/banner-sweeper/issues/7) (map [#6](https://github.com/ratoi-crysty/banner-sweeper/issues/6)).

**Version.** Root `package.json` pins `@duckduckgo/autoconsent` at `^16.59.0`. The lockfile resolves **16.60.0**, which is what this note reads. Paths like `lib/web.ts` are relative to `node_modules/@duckduckgo/autoconsent/` and match the tag [`v16.60.0`](https://github.com/duckduckgo/autoconsent/tree/v16.60.0). The latest upstream release is v16.61.0 (2026-10-24), and its `lib/rules.ts` still has `SUPPORTED_RULE_STEP_VERSION = 3`, so the Step vocabulary below is still current.

Source shorthand: `GH:` means `https://github.com/duckduckgo/autoconsent/blob/v16.60.0/`.

## TL;DR

- A Rule is a plain JSON `AutoConsentCMPRule` (`lib/rules.ts`). It has **four required arrays**: `detectCmp`, `detectPopup`, `optOut` and `optIn` (`optIn` may be `[]`), plus `name`. Every other field is optional.
- Rules we pass in `initResp.rules.autoconsent` become ordinary rule instances, just like the decoded compact Bundled Rules. Nothing merges them and nothing de-duplicates them by name. **Precedence comes from the detection stage, not from where a rule came from.** First, rules whose `runContext.urlPattern` matches the frame URL are tried. Generic rules are tried only if none of those detected anything. Within a stage, every rule's `detectCmp` runs in parallel and the first popup to show wins.
- To make sure one of our Rules beats a Bundled Rule, give it a `urlPattern`. To stop a Bundled Rule completely, put its name in `config.disabledCmps`. **Do not start our names with `auto_`**, because `enableGeneratedRules: false` silently drops every rule whose name has that prefix.
- An `eval` Step can only name a snippet ID from `lib/eval-snippets.ts` (93 IDs in 16.60.0). It never carries code. Our background worker already runs only `evalSnippets[snippetId]`.
- The `test` Step list runs only when the background sends `selfTest`. Our extension never sends it today. In the Playwright harness, it runs right after `autoconsentDone`.
- **There is a ready-made validator, but it is not shipped as an API.** Upstream generates a JSON Schema from the TS type `AutoConsentCMPRule` with `ts-json-schema-generator` and checks it with Ajv (`scripts/validate-json-rules.js`). We can reproduce this from the **shipped** `dist/types/rules.d.ts`; I checked that the result is byte-identical to the schema built from `lib/rules.ts`. The schema is strict about keys and the `eval` enum. It does **not** catch empty or multi-action Steps, `removeClass` without `selector`, version mismatches, or CSS injection, so we need a semantic lint on top.
- "Generated rules" (`rules/generated/auto_<REGION>_<domain>_<rand>.json`, 451 of the 1190 Bundled Rules) come from DuckDuckGo's crawler, `tracker-radar-collector`. An LLM (`gpt-4o-mini`) only classifies the popup text and button texts. The rule itself is a **fixed template** built around one CSS selector for the Reject button.

## 1. The rule JSON format

### Top-level fields (`lib/rules.ts` → `AutoConsentCMPRule`)

| Field | Req. | Meaning (source) |
|---|---|---|
| `name` | yes | Rule ID. Reported in every message. Matched against `config.disabledCmps`. The prefix `auto_` marks a rule as "generated" (`lib/web.ts` `filterCMPs`). |
| `detectCmp` | yes | Steps, all of which must pass, run in order. "Is this CMP on the page?" Retried by the engine (§2). |
| `detectPopup` | yes | Steps. "Is its popup visible now?" Polled up to 10 times, every 500 ms (`waitForPopup`). |
| `optOut` | yes | Steps run in order. The first failing non-`optional` Step aborts and returns `false`. |
| `optIn` | yes (may be `[]`) | Same as `optOut`, but for Accept. The compact format drops it entirely (`lib/encoding.ts` `CompactedCMPRule.optIn = []`). |
| `test` | no | Self-test Steps (§4). If absent or empty, `hasSelfTest` is false. |
| `prehideSelectors` | no | CSS selectors that are hidden early with `opacity: 0` (style `#autoconsent-prehide`) on every page where the rule's runContext matches, **before** detection runs. They are un-hidden after `prehideTimeout` (2000 ms) or when detection finds nothing. |
| `runContext` | no | `{ main?: boolean = true, frame?: boolean = false, urlPattern?: string = '' }` (`lib/cmps/base.ts` `defaultRunContext`). `urlPattern` is a JS regex string matched with `String.match` against the **current frame's** `location.href`. |
| `cosmetic` | no | The rule only hides things. Cosmetic rules are tried only when no non-cosmetic rule found a popup. They can be turned off with `enableCosmeticRules`. |
| `intermediate` | no | A multi-page or multi-frame flow. `autoconsentDone` is not sent after this stage. |
| `minimumRuleStepVersion` | no | The engine skips the rule silently if this is greater than `SUPPORTED_RULE_STEP_VERSION` (3) (`addDeclarativeCMP`). |
| `openCmp` | no | Steps. Not called by the engine itself, and not in the compact format. |
| `comment`, `_metadata`, `vendorUrl` (deprecated) | no | Ignored at runtime. `_metadata.manuallyReviewUpdates` and `_metadata.deduplicatedFrom` are used by the crawler and the build tooling. |

The same list, in prose, is in `docs/rule-syntax.md`. `AGENTS.md` contains upstream's authoring guidelines.

### Steps (`AutoConsentRuleStep`)

A Step is an **intersection of `Partial<…>` types**. That makes it one object that may contain any of the keys below, plus `optional` and `comment` (`lib/rules.ts`). `evaluateRuleStep` (`lib/cmps/base.ts`) checks every key that is present, **runs all of them**, and ANDs the results. A Step with no recognised key returns `false` ("Unrecognized rule"). `negated: true` inverts the final result. `optional: true` makes a failed Step non-fatal in a sequence.

| Step | Shape | Behaviour (`lib/dom-actions.ts`, `lib/utils.ts`) | Ver. |
|---|---|---|---|
| exists | `{ exists: Sel }` | At least one match. | 1 |
| visible | `{ visible: Sel, check?: 'all'\|'any'\|'none' }` | Default `all`. Visibility is `offsetParent !== null`, or `position: fixed` and not `display: none`. Prehide (opacity) does **not** affect it. | 1 |
| waitFor | `{ waitFor: Sel, timeout? }` | Polls every 200 ms. **Default timeout is 10 000 ms**, not the 1000 shown in the docs example. | 1 |
| waitForVisible | `{ waitForVisible: Sel, timeout?, check? }` | Default check is `any`, default timeout 10 000 ms. Use `check: 'none'` to wait for something to disappear. | 1 |
| click | `{ click: Sel, all?: boolean }` | `HTMLElement.click()` on the first match, or on every match with a tick between clicks. Fails if nothing matches. | 1 |
| waitForThenClick | `{ waitForThenClick: Sel, timeout?, all?, retry?, retryInterval? }` | `waitFor`, then `click`. `retry` re-clicks while the element is still visible (default interval 300 ms). | 1 |
| wait | `{ wait: ms }` | Unconditional. Upstream bans it in `detectCmp`/`detectPopup`. | 1 |
| hide | `{ hide: string, method?: 'display'\|'opacity' }` | Appends `${selector} { display:none !important; z-index:-1 !important; pointer-events:none !important }` to `<style id="autoconsent-css-rules">`. **Takes a single CSS string, not an array**, so it cannot pierce shadow DOM or frames. | 1 |
| cookieContains | `{ cookieContains: string }` | Substring test on `document.cookie`. Cannot see HttpOnly cookies. | 1 |
| eval | `{ eval: SnippetId }` | See §3. | 1 |
| if / then / else | `{ if: { exists }\|{ visible, check? }, then: Step[], else?: Step[] }` | The condition may **only** be `exists` or `visible`. The result is the result of the chosen branch. With no `else` and a false condition, the result is `true`. | 1 |
| any | `{ any: Step[] }` | Tries each Step in order. True on the first success. | 1 |
| negated | `{ negated: true, … }` | Inverts the result **after** the Step runs. It does not change what a wait waits for. | 1 |
| removeClass | `{ removeClass: string, selector: Sel }` | `classList.remove` on all matches. | 2 |
| setStyle | `{ setStyle: css, selector: Sel }` | **Replaces** `style.cssText`. | 2 |
| addStyle | `{ addStyle: css, selector: Sel }` | Appends `; css` to `style.cssText`. | 2 |
| stylesheet | `{ stylesheet: cssRuleText, stylesheetId? }` | Appends a raw CSS rule to the same `<style>`. De-duplicated by marker or text. Keeps applying to elements that match later. | 3 |

**Selectors (`ElementSelector = string | string[]`).** A string is a `querySelectorAll` CSS selector. With the `xpath/` prefix it is run through `document.evaluate` instead. `aria/`, `text/` and `pierce/` prefixes are accepted, but they **always return no matches** (`querySingleReplySelector`). An array is a chain: each later selector runs inside the **first** match of the previous one. If that match has an open `shadowRoot`, the search goes into it. If it is a same-origin `iframe`, the search goes into its `contentDocument`. That is how a Step pierces open shadow DOM and same-origin iframes. Closed shadow roots and cross-origin iframes cannot be reached from the top frame. Those need a rule with `runContext.frame: true`, which runs inside the frame's own content-script instance and whose `urlPattern` is matched against the frame URL.

**Frames.** Every frame where the content script is injected runs its own `AutoConsent` instance, with its own detection and its own messages. **Our manifest does not inject into frames today:** `apps/extension/manifest.config.ts` has no `all_frames: true`, so the content script runs only in the top frame. Until that changes, `runContext.frame` Rules, and the frame-only Bundled Rules (Sourcepoint, TrustArc and similar iframe CMPs), never run in our extension. Whether a rule runs in a given frame is decided by `checkFrameContext` from `main` and `frame`. A flow that spans the top page and a frame needs two rules, and every stage except the last must be `intermediate: true` (`docs/rule-syntax.md` § Intermediate rules).

## 2. How our rules combine with the compact Bundled Rules

Code path: `AutoConsent` constructor → `addDynamicRules()` (the 11 code-based CMPs listed in `lib/cmps/all.ts`) → `initResp` → `initialize()` → `parseDeclarativeRules()` (`lib/web.ts`):

1. `rules.autoconsent[]` entries are added first, then `rules.compact` is decoded with `decodeRules` and added. Both go through `addDeclarativeCMP`, which only applies the `minimumRuleStepVersion` filter. The result is a single flat `this.rules` list: dynamic, then ours, then compact. **No merge, no override and no name de-duplication.** If one of our rules has the same `name` as a Bundled Rule, both instances exist and both run. A thrown decode error on the compact bundle is caught and logged. Our rules are not affected.
2. `filterCMPs` removes rules named in `disabledCmps`, cosmetic rules when `enableCosmeticRules` is false, and `auto_*` names when `enableGeneratedRules` is false.
3. `prehideElements()` hides the `prehideSelectors` of every rule whose runContext matches this frame, plus a hard-coded Didomi list.
4. `findCmp(detectRetries = 20)` (`lib/web.ts`): rules allowed in this frame type are split into **site-specific** (`urlPattern` present and matching), **generic** (no `urlPattern`), and heuristic (off in our config). Each stage runs `detectCmp` on all its rules in parallel, sends `cmpDetected` for each hit, and **stops at the first stage with any hit**. If nothing is found, it waits for 500 ms plus a DOM mutation and retries.
5. `_start()`: the detected rules are split into non-cosmetic and cosmetic. `detectPopups()` polls `detectPopup` for all of them (up to 10 times, every 500 ms). The **first** to resolve (`Promise.any`) gets `handlePopup` → `doOptOut()`. If more than one popup is found, the content script sends `autoconsentError { msg: 'Found multiple CMPs, check the detection rules.' }` (the Playwright harness treats this as allowed). Cosmetic rules are only tried if no non-cosmetic popup was found.

Consequences for us:

- A Site-scoped Rule of ours (with a `urlPattern`) is checked before every generic Bundled Rule. That includes the code-based OneTrust, Cookiebot, Sourcepoint and the others, because none of them except TikTok (`urlPattern: 'tiktok'`) has a `urlPattern`. This precedence holds **per attempt**: if our `detectCmp` misses on an attempt (for example, the banner has not rendered yet) and a generic Bundled Rule hits on that same attempt, the Bundled Rule wins. A Bundled site-specific rule whose `urlPattern` also matches competes with ours in the same stage, and the first popup to show wins.
- To guarantee our Rule wins, also send the competing Bundled Rule's name in `config.disabledCmps`. Watch out for de-duplicated Bundled Rule names, such as `auto_US_dropbox.com_0_+1`.
- Our extension already filters the compact bundle with `filterCompactRules({ url, mainFrame })` (`apps/extension/src/background/services/auto-consent-background.ts`). Our own list should be filtered the same way, by `urlPattern` and `runContext`, before it goes into `initResp`, so that each frame gets only the Rules relevant to it.
- A `prehideSelectors` entry on one of our Rules that has **no `urlPattern`** is applied on every page. Detection should always emit a `urlPattern` and keep prehide selectors narrow, or leave them empty.

## 3. `eval` snippets (ADR-0003 / ADR-0007)

- `lib/eval-snippets.ts` exports `snippets`, an object of **93** named arrow functions in 16.60.0, re-exported as `evalSnippets` from the package root. Examples: `EVAL_DIDOMI_OPT_OUT`, the `EVAL_USERCENTRICS_API_*` family, `EVAL_TEALIUM_*`, `EVAL_CONSENTMANAGER_*`, and the `EVAL_TESTCMP_*` test fixtures. Almost all of them call one specific CMP's JS API or inspect its storage. 46 Bundled Rules use `eval`.
- A rule references one by ID only: `{ "eval": "EVAL_DIDOMI_TEST" }`. In the type it is `eval: keyof typeof snippets`.
- Runtime (`lib/cmps/base.ts` `mainWorldEval`): the content script looks the ID up in **its own bundled** `snippets`. If the ID is unknown, the Step returns `false` and nothing is sent. If it is known, the script sends `{ type: 'eval', id, code: '(<fn source>)()', snippetId }` and waits for `evalResp`. The eval **times out after 1000 ms** and then counts as `false` (`lib/eval-handler.ts`).
- Our background worker (`handleEval`) **ignores `code`** and runs `chrome.scripting.executeScript({ world: 'MAIN', func: evalSnippets[message.snippetId] })`. Rule data therefore cannot carry code, which meets ADR-0003 and ADR-0007. The only thing a Rule chooses is *which* bundled function runs. Note that upstream's own addon and Playwright harness do evaluate `msg.code`; our worker is stricter.
- For Detection, the snippets are tied to CMPs that the Bundled Rules already cover, so an LLM rarely has a legitimate reason to use one. Either forbid `eval` in Detected Rules, or allow-list a few.

## 4. The `test` step

- `test` is a normal Step list, run by `AutoConsentCMP.test()` through `_runRulesSequentially`. If it is missing or empty, `hasSelfTest` is false and the base implementation returns `true`.
- **When it runs:** only when the content script receives `{ type: 'selfTest' }` (`receiveMessageCallback` → `doSelfTest`), which then sends `selfTestResult { cmp, result, url }`. The engine never triggers it by itself. After a successful opt-out, `optOutResult.scheduleSelfTest` is `true` if the rule has a test. The orchestrator is expected to remember that frame and send `selfTest` to it after `autoconsentDone`:
  - Upstream MV3 addon (`dist/addon-mv3/background.bundle.js`, cases `optOutResult` and `autoconsentDone`): exactly this.
  - Upstream Playwright harness (`playwright/runner.ts`): the same. It then asserts `selfTestResult.result === true` if `testSelfTest` is set.
  - **Our extension never sends `selfTest`** (`auto-consent-background.ts` handles only `init` and `eval`), so `test` never runs in Members' browsers today. It matters for Verification only.
- It runs right after `optOut`, so tests usually poll. The generated-rule template uses `{ waitForVisible: <reject button>, timeout: 1000, check: 'none' }`. Upstream prefers `cookieContains` when the CMP stores consent in a cookie. `docs/rule-syntax.md` says `test` is "currently only used in Playwright tests". `AGENTS.md` says self-tests are optional and may fail if the screenshots show the popup was handled. The crawler records `selfTestFailures` in `data/coverage.json`.

## 5. Messages that report progress and outcome

All types are in `lib/messages.ts`. Content script → background:

| Message | When (`lib/web.ts`) | Payload |
|---|---|---|
| `init` | Constructor, when no config was passed (our case) | `url` |
| `report` | On **every** `updateState` | `instanceId`, `url`, `mainFrame`, `state: ConsentState` (`lifecycle`, `detectedCmps`, `detectedPopups`, `selfTest`, `clicks`, `startTime`/`endTime`, …) |
| `cmpDetected` | Each rule whose `detectCmp` passed | `cmp`, `url` |
| `popupFound` | Each rule whose `detectPopup` passed | `cmp`, `url` |
| `optOutResult` / `optInResult` | After `optOut`/`optIn` runs | `cmp`, `result`, `scheduleSelfTest`, `url` |
| `autoconsentDone` | Only if the result is true **and** the rule is not `intermediate` | `cmp`, `isCosmetic`, `url`, `duration`, `totalClicks` |
| `selfTestResult` | After `selfTest` | `cmp`, `result`, `url` |
| `autoconsentError` | When more than one popup was found | `details: { msg, cmps }` |
| `eval` | An `eval` Step | `id`, `code`, `snippetId` |
| `visualDelay` | Only when `visualTest` is on | `timeout` |

Background → content: `initResp { rules, config }`, `optOut`, `optIn` (used when `autoAction` is null), `selfTest`, `evalResp { id, result }`, `measurePerformance`.

`report.state.lifecycle` moves through `loading → waitingForInitResponse → initialized → started → nothingDetected | cmpDetected → openPopupDetected → runningOptOut → done | optOutSucceeded (intermediate) | optOutFailed`. One gotcha: if a CMP is detected but no popup ever shows, lifecycle **stays `cmpDetected`** and no further message arrives. Verification therefore needs its own timeout. `playwright/runner.ts` `runAssertions()` is a ready-made reference for asserting this sequence: detected, popup found, done, `optOutResult.result`, `selfTestResult.result`, and no reload loop, meaning no duplicate `popupFound` and at most one `autoconsentDone`.

## 6. Checking a Rule before running it

**What upstream ships:**

- **TypeScript types.** `import type { AutoConsentCMPRule, AutoConsentRuleStep, RuleBundle, … } from '@duckduckgo/autoconsent'` works. `dist/types/web.d.ts` re-exports everything from `rules.ts` and `messages.ts`.
- **No JSON Schema file and no runtime validator.** The `exports` map exposes only `.`, `./heuristics`, `./rules/rules.json` and `./rules/compact-rules.json`.
- **A schema generator, used as a lint script.** `scripts/validate-json-rules.js` (`npm run rule-syntax-check`) runs `ts-json-schema-generator` on `lib/rules.ts`, type `AutoConsentCMPRule`, compiles the result with `ajv` (`allowUnionTypes: true`), and validates `rules/autoconsent/*.json`. Both are devDependencies of autoconsent. It does not check `rules/generated/` (`AGENTS.md`). I ran the same approach on the 16.60.0 Bundled Rules, and 13 of the 1190 fail: 12 generated rules carry an extra `text` key on a Step, and `auto_US_musicnotes.com_0` passes an array to `hide`.

**What I checked by running it** (generator v2 + Ajv v8, in a scratch directory, not committed):

- The schema can be generated from the **shipped** `dist/types/rules.d.ts`, with no upstream source needed (use `skipTypeCheck: true`). The result is byte-identical to the one built from `lib/rules.ts`, about 5.6 KB minified. The `eval` property becomes an `enum` of all 93 snippet IDs, so it moves with the installed version.
- It **rejects**: unknown top-level or Step keys (`additionalProperties: false`), unknown `eval` IDs, a missing `optIn`, an invalid `check`, and `if: { click }`.
- It **accepts**, although these are broken or risky at runtime:
  - an empty Step `{}`, which always evaluates `false`;
  - multi-action Steps such as `{ click, waitFor }`;
  - `removeClass`/`setStyle`/`addStyle` without `selector`, which evaluates `false`;
  - a `minimumRuleStepVersion` higher than the client supports (the rule is silently skipped), or one lower than the Steps used;
  - any string as `urlPattern`, with no compile or ReDoS check;
  - **arbitrary CSS text** in `hide`, `stylesheet`, `setStyle` and `addStyle`. `hide` and `stylesheet` are concatenated straight into a `<style>` element, so a Rule could inject `@import` or `url(...)`. That makes the page fetch a URL, which can leak browsing. ADR-0002 made this same point about its own `css.inject`.

**What this means for #13 and #15:** validate in two layers, each in one shared module that both the API and the extension use:

1. Generate the JSON Schema from the installed `dist/types/rules.d.ts` at build time, and validate with Ajv. The same schema, or a trimmed copy of it, can be the LLM's output and tool schema.
2. Run a semantic lint on top. It should:
   - require exactly one action key per Step (`if`/`then`/`else` count as one);
   - require `selector` with `removeClass`, `setStyle` and `addStyle`;
   - check that `minimumRuleStepVersion` matches the Steps used and is ≤ `SUPPORTED_RULE_STEP_VERSION`;
   - ban `wait`, `waitFor` and `waitForThenClick` in `detectCmp`/`detectPopup`;
   - require a `urlPattern` that compiles and is anchored at the host;
   - reject a `name` that starts with `auto_` or collides with a Bundled Rule name;
   - reject `{`, `}`, `@` and `url(` in CSS strings, or forbid `stylesheet` outright;
   - forbid or allow-list `eval`.

## 7. `enableGeneratedRules` and "generated" rules

- **Switch:** `Config.enableGeneratedRules` (default `true`, `lib/utils.ts` `normalizeConfig`). When it is false, `filterCMPs` drops every rule whose **name starts with `auto_`**, whether it is a Bundled Rule or ours. It was added in upstream [PR #807](https://github.com/duckduckgo/autoconsent/pull/807), after generated rules were introduced in [#793](https://github.com/duckduckgo/autoconsent/pull/793) and [#796](https://github.com/duckduckgo/autoconsent/pull/796).
- **Where they live:** `rules/generated/*.json` (553 files). `rules/build.ts` merges them with `rules/autoconsent/*.json` and runs `deduplicateRules`, which merges site-specific rules with identical bodies into one rule named `<first>_+N` with a combined `urlPattern`. The result is `rules.json`, `compact-rules.json` and `rule-index.json`. In the 16.60.0 bundle, 451 of the 1190 rules are `auto_*`. `AGENTS.md`: "Do not add new files to `rules/generated/`: only the crawler creates them."
- **How they are produced:** by [`duckduckgo/tracker-radar-collector`](https://github.com/duckduckgo/tracker-radar-collector/tree/main/post-processing/generate-autoconsent-rules) (read at commit `f35cfe0`):
  1. `CookiePopupsCollector` crawls the top sites per region and scrapes candidate popups and buttons, using the heuristics exported from `@duckduckgo/autoconsent/heuristics`.
  2. `detection.js` confirms each popup with a regex heuristic **or an LLM** (OpenAI `gpt-4o-mini`, structured output `{ isCookieConsentNotice }`). It then labels each button `settings | accept | reject | acknowledge | other`, using the regex first and the LLM second.
  3. `generation.js` turns each Reject button into a **fixed template**: `name: auto_<REGION>_<domain>_<3 random chars>`, `urlPattern: ^https?://(www\.)?<domain>/`, `main`/`frame` set from the frame the button was in, `detectCmp: [{exists: sel}]`, `detectPopup: [{visible: sel}]`, `optOut: [{wait: 500}, {waitForThenClick: sel, comment: <button text>}]`, `optIn: []`, `test: [{waitForVisible: sel, timeout: 1000, check: 'none'}]`.
  4. It also writes a Playwright spec (`generateCMPTests(name, [url], { testOptIn: false, testSelfTest: true, onlyRegions: [region] })`) and review notes. It re-crawls, overrides or flags existing rules, and respects `_metadata.manuallyReviewUpdates`.
  - The LLM classifies. It never writes selectors or Steps. The selector is a long structural CSS path from the scraper, for example `body > div#… > div:nth-child(3):not([id]) > button:nth-child(2):not([id])`.
- **Relevance to Detection:** this is a working precedent for "LLM finds the Reject button, a template writes the Rule, Playwright verifies it". It is a useful baseline to compare our LLM-authored Rules against. The `./heuristics` export (`classifyButtonTextRegex`, `checkHeuristicPatterns`, `getPotentialPopups`, `getButtonData`) is available to our Detection tools without forking anything.

## Other findings worth knowing

- **Our extension only runs in the top frame.** `content_scripts` in `apps/extension/manifest.config.ts` has no `all_frames: true`. Bundled Rules for CMPs that render in iframes, and any `frame: true` Rule, never run. This matters for the "hard banner shapes" in #6.
- **Verification can reuse upstream's harness pieces.** The npm package ships `playwright/runner.ts`, `playwright/isolated-world.mjs` and the prebuilt `dist/autoconsent.playwright.js`. The `.mjs` file injects the content script into a CDP isolated world of every frame, the way the extension does, and bridges messages to Node. These files are outside the `exports` map, so load them by file path. We would replace `rules` in `initResp` with the Bundled Rules plus the candidate Rule.
- **Decline only.** `AGENTS.md` forbids clicking a TIER2 (Accept-only) button in `optOut`, and treats age gates, paywalls, newsletters and the like as out of scope. That matches our Decline and Paywall terms, and the prompt for Detection can quote it.
- **Upstream's rules for reliable Steps:** use `check: 'none'` rather than `negated` for "not visible"; keep `wait` under 1 s; prefer `waitForThenClick` with `retry` over padding with `wait`; use array selectors to pierce shadow DOM; prefer `data-*` attributes and stable IDs over generated class hashes (`AGENTS.md` § Selectors, § Rule step traps).

## Sources

- Installed package `node_modules/@duckduckgo/autoconsent@16.60.0`: `lib/rules.ts`, `lib/web.ts`, `lib/cmps/base.ts`, `lib/dom-actions.ts`, `lib/utils.ts`, `lib/encoding.ts`, `lib/eval-snippets.ts`, `lib/eval-handler.ts`, `lib/messages.ts`, `lib/types.ts`, `docs/rule-syntax.md`, `docs/api.md`, `docs/puppeteer.md`, `AGENTS.md`, `scripts/validate-json-rules.js`, `rules/build.ts`, `rules/create-rule.mjs`, `playwright/runner.ts`, `playwright/content.ts`, `playwright/isolated-world.mjs`, `dist/addon-mv3/background.bundle.js`, `dist/types/*.d.ts`, `data/Readme.md`, `CHANGELOG.md`, `package.json`. Upstream mirror: [GH v16.60.0](https://github.com/duckduckgo/autoconsent/tree/v16.60.0).
- [tracker-radar-collector `post-processing/generate-autoconsent-rules/`](https://github.com/duckduckgo/tracker-radar-collector/tree/main/post-processing/generate-autoconsent-rules): `main.js`, `detection.js`, `generation.js`, `verification.js`.
- This repo: `apps/extension/src/background/services/auto-consent-background.ts`, `apps/extension/src/content/services/duck-duck-auto-consent.ts`, ADR-0002, ADR-0003, ADR-0007.
