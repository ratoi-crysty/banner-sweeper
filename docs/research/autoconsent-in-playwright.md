# Running autoconsent inside a Playwright page

Research for [#8](https://github.com/ratoi-crysty/banner-sweeper/issues/8) (map #6). Researched 2026-10-26.

**Versions examined:** `@duckduckgo/autoconsent` **16.60.0**. This is what `^16.59.0` resolves to in `pnpm-lock.yaml`; the latest release is 16.61.0 (2026-10-24), which changes only rules (`gh api repos/duckduckgo/autoconsent/compare/v16.60.0...v16.61.0`). `playwright-core` **1.64.1**. The npm tarball ships the whole repo (`playwright/`, `tests/`, `docs/`, `lib/`), so every autoconsent path below can be read under `node_modules/@duckduckgo/autoconsent/` as well as on GitHub (`https://github.com/duckduckgo/autoconsent/blob/v16.60.0/<path>`).

## Answer in brief

1. **Bundle.** Inject `dist/autoconsent.playwright.js`. It is a self-contained IIFE built by `build.sh` (`esbuild --format=iife playwright/content.ts`). On load it creates `new AutoConsent(window.autoconsentSendMessage, null, { autoconsent: [] })`: no config and no rules, so it immediately sends `init` and waits for `initResp`. It exposes `window.autoconsentReceiveMessage(msg)` for replies. All rules arrive in `initResp`, so **Node decides the rule set for every run.**
2. **Injection: the isolated world via CDP is recommended.** Use the same per-frame CDP isolated-world wiring that autoconsent's own E2E runner uses on Chromium (`playwright/isolated-world.mjs`). It matches the extension's isolated content-script world, ignores page CSP, hides the bridge from page scripts, and covers out-of-process iframes (OOPIFs). **This works through `chromium.connect()`** (checked with the prototype below). A simpler main-world variant also works: `page.exposeBinding('autoconsentSendMessage', …)` plus `page.addInitScript({ content: bundle })`.
3. **The Node handler plays the extension background.** It answers `init` with `{ type: 'initResp', config, rules }` and `eval` with `{ type: 'evalResp', id, result }`. The `eval` result comes from running `msg.code` in **that frame's main world**. The reply must arrive within **1 s**; after that the content script treats the eval as `false`.
4. **Stock check:** reply with the extension's exact config, plus `filterCompactRules(compactRules, { url, mainFrame })`.
5. **Verification:** reply with `rules: { autoconsent: [candidate] }` **and** `disabledCmps: [all 11 built-in code-based CMP names]`. Without that list, autoconsent still runs its hard-coded TypeScript CMPs (Onetrust, Cookiebot, Klaro, …) whatever rules you pass. This is the surprising finding.
6. **Verification flow:** set `autoAction: null` and `enablePrehide: false`. Wait for `popupFound(candidate)`, take the "before" snapshot, then send `{ type: 'optOut' }` to that frame. Wait for `optOutResult` and `autoconsentDone`. If `scheduleSelfTest` is set, send `{ type: 'selfTest' }` and wait for `selfTestResult`. Take the "after" snapshot, then `page.reload()` in the same context. Expect `cmpDetected` but no `popupFound` within about 7 s.

## 1. How autoconsent's own repo runs in Playwright

The source is `playwright/runner.ts` (the E2E harness behind `tests/*.spec.ts`; 751 spec files call `generateCMPTests(cmp, urls, opts)`).

- **Build:** `build.sh` → `dist/autoconsent.playwright.js` (IIFE, es2021) from `playwright/content.ts`. The runner reads it with `fs.readFileSync(path.join(__dirname, '../dist/autoconsent.playwright.js'))`.
- **It does not use `addInitScript`.** It has two paths:
  - **Chromium (default since PR #1672, 2026-10-22, first shipped in 16.60.0):** `injectIntoIsolatedWorld(page, handlerFactory, contentScript)` from `playwright/isolated-world.mjs`. For every frame's main execution context it calls CDP `Page.createIsolatedWorld`. On that world it calls `Runtime.addBinding` with a per-context name, then `Runtime.evaluate`s `window.autoconsentSendMessage = (m) => { window.<binding>(JSON.stringify(m)); return Promise.resolve(); }; <bundle>`, using `allowUnsafeEvalBlockedByCSP: true`. Replies go in through `Runtime.evaluate("autoconsentReceiveMessage(...)", uniqueContextId)`. OOPIFs get their own session through `page.context().newCDPSession(frame)` on `frameattached`/`framenavigated`.
  - **Other browsers:** `page.exposeBinding('autoconsentSendMessage', ({ frame }, msg) => …)`, then `page.goto(url, { waitUntil: 'commit' })`. After that it calls `frame.evaluate(contentScript)` on every frame and again on each `framenavigated`.
- **`init` reply** (`runner.ts` `messageCallback`): `{ type: 'initResp', config: { enabled: true, autoAction, disabledCmps: [], enablePrehide: false, detectRetries: 20, enableCosmeticRules: true, visualTest: true }, rules: { compact: filterCompactRules(compactRules, { url: msg.url, mainFrame }) } }`. For optIn tests it sends full `rules.json` instead, because compact rules omit optIn. Note that it re-filters the rules **per frame**, using the `init` message's URL.
- **Remote browsers:** `playwright/oxylabs.mjs` runs the same harness against a remote Oxylabs browser through `chromium.connectOverCDP(wss://…)`. That is CDP, not the Playwright-protocol `connect()` we use; see §7.
- **Puppeteer recipe:** `docs/puppeteer.md` documents the main-world pattern (`exposeFunction` + `evaluateOnNewDocument` + `initResp` with rules + `eval` → `page.evaluate`). This is the closest upstream doc to the `addInitScript` approach.

## 2. The messaging bridge

Message types are defined in `lib/messages.ts`; the sequence is described in `docs/api.md`.

| From content script | Node must… |
| --- | --- |
| `init { url }` | Reply `initResp { config, rules }` to **the same frame**. Until then lifecycle is `waitingForInitResponse` and nothing runs. |
| `eval { id, code, snippetId }` | Run `code` in the frame's **main world**, then reply `evalResp { id, result }`. |
| `cmpDetected`, `popupFound`, `optOutResult { result, scheduleSelfTest }`, `autoconsentDone { isCosmetic, duration, totalClicks }`, `selfTestResult { result }`, `autoconsentError`, `report { state }`, `visualDelay` | These are events to record (see §5). |

Messages from Node to the content script (`BackgroundMessage`) are `initResp`, `evalResp`, `optOut`, `optIn`, `selfTest` and `measurePerformance`. They are dispatched by `AutoConsent.receiveMessageCallback` (`lib/web.ts`).

**`eval` details:**

- `code` is always `(<snippet function source>)()`, from `getFunctionBody` in `lib/eval-snippets.ts`.
- Rule `eval` steps can only name a key of the bundled `snippets` map (`EvalRule = { eval: keyof typeof snippets }` in `lib/rules.ts`; 93 `EVAL_*` snippets in 16.60.0). So a candidate Rule **cannot carry arbitrary JS**. Like the extension (`auto-consent-background.ts`), the API should only run `evalSnippets[msg.snippetId]` and ignore `msg.code`.
- **Timeout:** `requestEval` in `lib/eval-handler.ts` creates a `Deferred` with a **1000 ms** timer. On timeout the step resolves `false` and the rule usually fails. Over a remote link, each eval needs the binding call plus `frame.evaluate`/`Runtime.evaluate` and the `evalResp` delivery, so keep the handler free of other awaits.
- **Alternative:** setting `config.isMainWorld: true` makes snippets run inline with no round trip (`mainWorldEval` in `lib/cmps/base.ts`). That is only valid if the bundle itself runs in the main world.

**Isolated vs main world:**

| | Isolated world (CDP) | Main world (`exposeBinding` + `addInitScript`) |
| --- | --- | --- |
| Fidelity to the extension | Same as the extension's isolated content script | Page scripts can see or overwrite `window.autoconsentSendMessage` and `window.autoconsentReceiveMessage`, and any monkey-patched DOM APIs |
| CSP | Ignored (`allowUnsafeEvalBlockedByCSP`) | `addInitScript` and `frame.evaluate(code)` also worked under `script-src 'self'` in the prototype |
| Start time | On `Runtime.executionContextCreated`, one CDP round trip late (more over a remote link) | Before any page script |
| Browsers | Chromium only (CDP) | Any |
| Code | Vendor `isolated-world.mjs` (about 200 lines, MPL-2.0) | About 15 lines |

**Recommendation:** use the isolated world, matching upstream CI and our extension. Keep the main-world path behind the same `ContentScriptTarget { send, evalInMainWorld, isMainFrame }` interface (the runner's own abstraction) as a fallback.

`playwright/isolated-world.mjs` is **not** in the package `exports`. Import it by file path, or better, vendor and port it to TypeScript with its MPL-2.0 notice kept on that file. The bundle itself is not exported either: resolve it with `path.join(path.dirname(require.resolve('@duckduckgo/autoconsent')), 'autoconsent.playwright.js')`. The main entry is `dist/autoconsent.cjs.js`, and the rules JSON is exported. `apps/api` builds with `NxAppWebpackPlugin` (target node), which keeps `node_modules` external. So the runtime image needs the package installed, or the bundle copied in as a webpack asset.

## 3. Choosing the rule set: stock vs one candidate

`AutoConsent`'s constructor **always** calls `addDynamicRules()`, which pushes every class in `lib/cmps/all.ts`: `TrustArc-top`, `Cybotcookiebot`, `Sourcepoint-frame`, `consentmanager.net`, `Evidon`, `Onetrust`, `Klaro`, `Uniconsent`, `Conversant`, `tiktok.com`, `Admiral`. `initialize()` then adds the declarative rules from `initResp` and runs `filterCMPs(rules, config)`. That function keeps a CMP only if:

- its name is not in `disabledCmps`;
- it is not cosmetic, or `enableCosmeticRules` is true;
- its name does not start with `auto_`, or `enableGeneratedRules` is true.

`addDeclarativeCMP` also **silently drops** rules whose `minimumRuleStepVersion` is above `SUPPORTED_RULE_STEP_VERSION` (3).

**Stock check** (is the Site already covered?):

- Send the **same config as the extension** (`apps/extension/src/background/services/auto-consent-background.ts`) and `rules: { autoconsent: [], compact: filterCompactRules(compactRules, { url: msg.url, mainFrame }) }`, filtered per frame from the `init` message.
- Dynamic CMPs stay enabled, because they are part of stock coverage.
- Share that config from a lib so the API and the extension cannot drift apart.
- Treat `autoconsentDone.isCosmetic === true` as "hidden, not Declined". `CONTEXT.md` says Dismiss is never enough for a Consent Banner.

**Verification** (one candidate Rule):

- Send `rules: { autoconsent: [candidate] }` with `disabledCmps: DYNAMIC_CMP_NAMES`, `heuristicMode: 'off'` and `enableHeuristicDetection: false`.
- The package does not export `dynamicCMPs`. Hard-code the 11 names, check them on every autoconsent bump, **and** assert that every `cmpDetected` or `popupFound` names the candidate. Any other name is a harness error.
- Reject candidates that:
  - use a name from that list (it would disable itself),
  - start with `auto_` (needs `enableGeneratedRules`),
  - have `minimumRuleStepVersion > 3`.
- `runContext` (`main`, `frame`, `urlPattern`) and the rule's `detectCmp`, `detectPopup`, `optOut` and `test` are evaluated by the library as usual. With a single rule there is no need to filter per frame on the Node side.
- In the prototype, the stock run on a page containing a hidden `.klaro > .cookie-notice` reported `cmpDetected:Klaro`. The Verification runs on the same page never did.

## 4. Iframes, including cross-origin

- **Isolated world:** `injectIntoIsolatedWorld` attaches to the page's CDP session (main frame and in-process frames). On `frameattached`/`framenavigated` it opens `newCDPSession(frame)` for each OOPIF; this throws for in-process frames, which the page session already covers. On every `Runtime.executionContextCreated` of type `default` with a real origin, it creates an isolated world and injects the bundle, so new documents after navigation or reload are covered automatically. `isMainFrame(frameRef)` comes from the frame tree.
- **Main world:** both `exposeBinding` ("the `window` object of every frame") and `addInitScript` ("whenever the child frame is attached or navigated") cover all frames, including cross-origin ones (`playwright-core` `types/types.d.ts`). The binding source gives `{ frame }`; reply with `frame.evaluate((m) => window.autoconsentReceiveMessage(m), msg)`. Use `isMainFrame = frame.parentFrame() === null`.
- **Always reply to the frame that sent the message.** `initResp` rules can depend on `mainFrame` and URL. `optOut` and `selfTest` must reach the frame whose `popupFound` you are acting on, because `foundCmp` is per instance. Keep the target object from the `popupFound` message.
- **Prototype:** a cross-site iframe (`127.0.0.1` top, `localhost` frame) was confirmed as an OOPIF over `connect()` (`newCDPSession(frame)` succeeded). The `{ main: false, frame: true, urlPattern }` candidate was detected, Declined and self-tested inside it in both modes.

## 5. Observing the outcome, timeouts and the reload check

The events the content script sends are listed in §2.

**Terminal signals:**

- `optOutResult.result`;
- `autoconsentDone` (only if the opt-out succeeded and the rule is not `intermediate`);
- `selfTestResult.result`.

**Negative outcomes have no dedicated message:**

- No CMP: `findCmp` retries `detectRetries` (20) times. Each retry waits at least 500 ms, and from the second attempt on also waits for a DOM mutation (60 s timeout, `waitForMutation` in `lib/dom-actions.ts`). At the end you get a `report` with `state.lifecycle === 'nothingDetected'`, or nothing at all on a quiet page.
- CMP present but no popup: `waitForPopup` polls 10 × 500 ms after `cmpDetected`. Then it logs "no popup found" and sends **no message**.
- **Use wall-clock budgets** like upstream (`runner.ts` `waitForMessage`/`assertMessageReceived`): `cmpDetected` ≤ 25 s (50 × 500 ms), `popupFound` ≤ 25 s, `autoconsentDone` ≤ 45 s (90 × 500 ms). Use `report.state.lifecycle` (`nothingDetected`, `optOutFailed`, `done`) to finish early.

**Recommended Verification sequence** (proven in the prototype):

1. `config.autoAction = null`. `handlePopup` then stops after `popupFound` ("waiting for opt-out signal").
2. `enablePrehide = false`, otherwise the banner is hidden in the "before" shot. Keep `visualTest = false`: `true` highlights clicked elements and emits `visualDelay`.
3. On `popupFound(candidate)`: take the before snapshot, then `target.send({ type: 'optOut' })`.
4. Expect `optOutResult.result === true`, then `autoconsentDone`.
5. If `optOutResult.scheduleSelfTest` is true, send `{ type: 'selfTest' }` to the same target and expect `selfTestResult.result === true`. The self-test runs the rule's `test` steps (`AutoConsentCMP.test()`); `hasSelfTest` is false when the rule has no `test`. Upstream sends the self-test only **after** `autoconsentDone`.
6. Take the after snapshot.
7. **Reload check:** `page.reload()` in the **same page and context**, so cookies and storage persist. Both wirings re-inject on the new document automatically (init script or binding persist; the isolated world is recreated on the new execution context). Clear recorded messages first. Wait for `cmpDetected(candidate)` (≤ ~10 s). Then allow the full `waitForPopup` window (~5 s + margin; the prototype used 7 s) and pass if **no** `popupFound` arrives. `cmpDetected` alone is fine: the CMP script is still on the page. A self-test cannot run after reload, because there is no `foundCmp` without a popup.
8. Also copy upstream's `assertNoReloadLoop`: wait for `networkidle` (≤ 5 s) plus 3 s, then fail on duplicate `popupFound` or more than one `autoconsentDone`. Some sites reload after a Decline.

## 6. Screenshots and the cookie/storage diff (same context)

- Use `page.screenshot()` for the before, after and after-reload shots. It returns a `Buffer` to the Node client, which works over `connect()`; store the buffer rather than relying on server-side paths. Upstream uses `{ type: 'jpeg', quality: 50, scale: 'css', timeout: 2000 }`.
- **Cookies, localStorage and IndexedDB:** `context.storageState({ indexedDB: true })` returns `cookies` plus `origins[].localStorage` (and `indexedDB`) for the whole context, cross-origin iframes included. Diff cookies keyed by `name|domain|path`, and localStorage per origin.
- **sessionStorage is not in `storageState`.** Use `page.sessionStorage.items()` (new `WebStorage` API, top-frame origin only) or `frame.evaluate(() => ({ ...sessionStorage }))` per frame.
- The prototype's diff correctly showed the top-level `bs_consent` cookie, localStorage keys for both origins, and sessionStorage for both.
- **Caveat:** a cookie set by a cross-site iframe did **not** appear. The browser blocked it as a third-party cookie (Brave); whether it lands depends on the remote browser's 3PC policy. Third-party CMP iframes that store consent in their own cookies (Sourcepoint, TrustArc) may therefore show "no change" yet still be fine. Verification should judge persistence by the reload check, not by the diff alone.

## 7. Remote `connect()` vs local launch

- **Protocol:** `chromium.connect(wsEndpoint)` speaks the Playwright protocol to a `launchServer`/`run-server` browser. Upstream's remote runs use `connectOverCDP`. Over `connect()`:
  - `context.newCDPSession(page)` and `context.newCDPSession(frame)` (OOPIF) work;
  - so do `Page.createIsolatedWorld`, `Runtime.addBinding`, `Runtime.evaluate` and CDP events.

  This was verified by connecting to a local `chromium.launchServer()` from `playwright-core` 1.64.1. The Docs note "CDP sessions are only supported on Chromium-based browsers", so the remote server must run Chromium, which `PLAYWRIGHT_HOST` does.
- **Version lock:** the `connect` client and the server must share **major.minor** ("1.2.3 → is compatible with 1.2.x"; `types.d.ts` on `connect`). Pin `playwright-core` to the server image's version (`mcr.microsoft.com/playwright:v1.64.x`).
- **Latency:** every binding call, reply and eval is a WebSocket round trip, versus in-process locally. This matters for the 1 s eval timeout (§2) and for the isolated world's late start (§2). It does not matter for the 500 ms polling loops.
- **Files:**
  - The bundle and rules are read on the API host and sent as strings (`addInitScript({ content })` or the `Runtime.evaluate` expression). Never pass a `path` that only exists on the API host to server-side APIs.
  - `screenshot()` buffers come back to the client.
- **Isolation:** use one `browser.newContext()` per run, and close it to discard cookies. Give every run a hard overall timeout, and close the context on failure, because a remote browser outlives a crashed Node handler.
- **No extension on the remote:** this whole approach replaces the extension, so there is no need to load an unpacked extension (which `connect()` cannot do anyway).

## 8. Prototype

`docs/research/autoconsent-in-playwright/prototype.mjs`. It is plain Node ESM, run from the repo root:

```bash
CHROMIUM_PATH=/usr/bin/brave OUT_DIR=/tmp/ac-proto node docs/research/autoconsent-in-playwright/prototype.mjs
```

It starts `chromium.launchServer()` and connects with `chromium.connect(server.wsEndpoint())`. It never contacts `PLAYWRIGHT_HOST`. It serves two local origins, with `script-src 'self'` CSP on the top page. It runs a stock check and two Verifications (a top-frame rule and a cross-origin-iframe rule), in both main-world and isolated-world modes.

Result with autoconsent 16.60.0 and Brave/Chromium 156:

- **Stock:** `cmpDetected:Klaro` only. The dynamic CMP was present; its popup was hidden.
- **All four Verifications:**
  - `popupFound` after about 0.5 s;
  - `optOutResult=true`, `autoconsentDone` and `selfTestResult=true`. The test step is `eval: EVAL_COOKIEBOT_5`, which reads a main-world global, so this proves the eval bridge works under CSP;
  - eval round trip 0–2 ms locally;
  - the diff showed the expected cookie, localStorage and sessionStorage changes;
  - after reload: `cmpDetected` and no `popupFound`;
  - no `Klaro` detection.

## Consequences for other tickets

- The **"one candidate rule only" guarantee needs `disabledCmps`** with the 11 built-in code CMPs, plus an assertion on detected names. Passing just `{ autoconsent: [candidate] }` is not enough.
- Candidate Rules in autoconsent JSON can only use bundled `EVAL_*` snippets. This fits `CONTEXT.md` ("Step never contains executable code"). Schema validation should still check `eval` values against `Object.keys(evalSnippets)` and enforce `minimumRuleStepVersion ≤ 3`.
- The stock check should count `isCosmetic` completions as **not Declined**.
- Pin `playwright-core` to the remote server's major.minor.

## Sources

- autoconsent v16.60.0:
  - `playwright/runner.ts`, `playwright/isolated-world.mjs`, `playwright/oxylabs.mjs`, `playwright/content.ts`
  - `standalone/content.ts`, `build.sh`
  - `lib/web.ts`, `lib/cmps/all.ts`, `lib/cmps/base.ts`, `lib/cmps/klaro.ts`
  - `lib/eval-handler.ts`, `lib/eval-snippets.ts`, `lib/messages.ts`, `lib/rules.ts`, `lib/utils.ts` (`normalizeConfig`), `lib/dom-actions.ts`
  - `docs/api.md`, `docs/puppeteer.md`, `package.json` (`exports`)
  - Browse at https://github.com/duckduckgo/autoconsent/tree/v16.60.0. Isolated-world harness: duckduckgo/autoconsent PR #1672 (commit `4cc24ebb`).
- Playwright 1.64.1 (`node_modules/playwright-core/types/types.d.ts`), matching https://playwright.dev/docs/api/class-browsertype#browser-type-connect, https://playwright.dev/docs/api/class-page#page-expose-binding, https://playwright.dev/docs/api/class-page#page-add-init-script, https://playwright.dev/docs/api/class-browsercontext#browser-context-new-cdp-session, https://playwright.dev/docs/api/class-browsercontext#browser-context-storage-state and https://playwright.dev/docs/api/class-webstorage.
- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/tot/Page/#method-createIsolatedWorld and https://chromedevtools.github.io/devtools-protocol/tot/Runtime/#method-addBinding.
- This repo: `apps/extension/src/background/services/auto-consent-background.ts`, `apps/extension/src/content/services/duck-duck-auto-consent.ts`, `apps/api/src/app/modules/playwright/playwright.service.ts` (uncommitted in the main checkout at time of writing), `CONTEXT.md`.
