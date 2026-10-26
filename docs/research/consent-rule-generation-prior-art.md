# Prior art for generating consent rules automatically

Research for [#11](https://github.com/ratoi-crysty/banner-sweeper/issues/11) (part of map #6). Researched 2026-10-26.

**Question:** What prior art exists for automatically generating cookie-consent rules with an LLM or a crawler, and what can Detection reuse or learn from it? Detection is the planned feature in which an LLM drives headless Playwright, writes a new autoconsent JSON rule for a Site the bundled rules miss, and verifies it by running real autoconsent. The main risk is that the agent Accepts instead of Declining.

## TL;DR

- **DuckDuckGo already generates autoconsent rules automatically, and the pipeline is public.** It lives in [`duckduckgo/tracker-radar-collector`](https://github.com/duckduckgo/tracker-radar-collector/tree/main/post-processing/generate-autoconsent-rules), not in autoconsent. The **LLM only classifies**: "is this a cookie popup?" and labels for button text. The **reject button is picked by autoconsent's regex classifier**. Rules are only ever single-click, first-layer rejects. 550 `auto_*` rules are in [`rules/generated/`](https://github.com/duckduckgo/autoconsent/tree/main/rules/generated) as of `96d9584` (2026-10-26).
- **autoconsent ships its own LLM-agent rule-authoring guide.** Its [`AGENTS.md`](https://github.com/duckduckgo/autoconsent/blob/main/AGENTS.md) and `.claude/skills/` cover rule syntax, selector stability, regional testing, screenshot checks, reload-loop checks, and a hard rule: *never click a TIER2 (single-Accept) button in `optOut`*. A bot account (`daxtheduck`) merges dozens of "Automated autoconsent rule update from CPM triage" PRs a week, all reviewed by humans. This is the closest prior art to Detection, and much of it can be reused directly.
- **autoconsent has a built-in heuristic Decline mode.** It is off by default: `enableHeuristicDetection: false`, `heuristicMode: 'off'`. Setting `heuristicMode: 'reject'` clicks a regex-identified reject button on any popup, with no rule needed. It is available in the version we already depend on.
- **Academic tools reach about 87–94% Decline accuracy.** BannerClick: 87.4% reject. CookieEnforcer: 91% (preprint) and 93.7% (USENIX '23). The recurring failure modes are reject hidden on a second layer or behind multi-select toggles, negations ("NOT Accept"), "accept necessary only" wording, and banners that have no reject at all.
- **LLM browser agents Accept even when told to Decline.** In "Invisible Consent" (CHI EA '26), agents accepted in **14.4%** of trials despite an explicit "deny all" instruction. Ukani et al. (2025) found 4 of 8 commercial agents clicked "accept all" in at least one setting. **Prompting alone is not a sufficient guard.** The Decline must be checked structurally, outside the LLM.

---

## 1. DuckDuckGo's pipeline for autoconsent "generated" rules

### What exists in autoconsent

- Generated rules live in `rules/generated/` and are named `auto_<REGION>_<domain>_<3 random chars>.json`. Build support was added in [#793](https://github.com/duckduckgo/autoconsent/pull/793) (merged 2025-06-20, v14.3.0). The first batch, 130 new rules, came in [#802](https://github.com/duckduckgo/autoconsent/pull/802). The `enableGeneratedRules` toggle came in [#807](https://github.com/duckduckgo/autoconsent/pull/807).
- `enableGeneratedRules` defaults to `true` ([`lib/utils.ts`](https://github.com/duckduckgo/autoconsent/blob/main/lib/utils.ts)). The filter in `lib/web.ts` simply drops any rule whose name starts with `auto_` when the flag is off.
- `_metadata.manuallyReviewUpdates` ([#858](https://github.com/duckduckgo/autoconsent/pull/858), 2025-08-06) marks a generated rule a human has edited. A later crawl that would overwrite it is then flagged for review. The PR links to an internal `tracker-radar-internal` PR, so part of the orchestration is private.
- `AGENTS.md`: "Do not add new files to `rules/generated/`: only the crawler creates them." It also says `npm run rule-syntax-check` **does not** check generated rules.

A generated rule looks like this (abridged from [`auto_AU_deezer.com_tmf.json`](https://github.com/duckduckgo/autoconsent/blob/main/rules/generated/auto_AU_deezer.com_tmf.json)):

```json
{
  "name": "auto_AU_deezer.com_tmf",
  "runContext": { "main": true, "frame": false, "urlPattern": "^https?://(www\\.)?deezer\\.com/" },
  "detectCmp":   [{ "exists":  "<full structural selector to the reject button>" }],
  "detectPopup": [{ "visible": "<same selector>" }],
  "optIn": [],
  "optOut": [{ "wait": 500 }, { "waitForThenClick": "<same selector>", "comment": "Refuse" }],
  "test":  [{ "waitForVisible": "<same selector>", "timeout": 1000, "check": "none" }]
}
```

The template is fixed: detect = the reject button exists or is visible; optOut = click it; self-test = it disappeared. `optIn` is always empty.

### The generator (public, in tracker-radar-collector)

Source: [`post-processing/generate-autoconsent-rules/`](https://github.com/duckduckgo/tracker-radar-collector/tree/main/post-processing/generate-autoconsent-rules) at `f35cfe0` (2026-10-23). First commit "Script for generating CPM rules" was [#139](https://github.com/duckduckgo/tracker-radar-collector/pull/139) (2025-06-24).

1. **Crawl.** `CookiePopupsCollector` loads each site in a regional crawl. It runs real autoconsent first, injecting `dist/autoconsent.playwright.js`. It then scrapes candidate popups with autoconsent's own DOM discovery (`window.autoconsentHeuristics.getPotentialPopups`). Candidates are fixed, sticky, or dialog-like elements, and only buttons in the viewport are kept. Each button gets a unique CSS selector.
2. **Skip known CMPs.** If any non-`auto_` rule matched the site, nothing is generated (`hasKnownCmp` in `main.js`).
3. **Classify the popup.** In [`detection.js`](https://github.com/duckduckgo/tracker-radar-collector/blob/main/post-processing/generate-autoconsent-rules/detection.js), the popup's text goes to **`gpt-4o-mini`** with a zod structured output `{ isCookieConsentNotice: boolean }`. The system prompt includes positive and negative examples; the negative examples are age gates, footers, and notification prompts. A regex check (`checkHeuristicPatterns`, minus `isExcludedPopup`) runs alongside.
4. **Label the buttons.** Each button in an LLM-confirmed or regex-confirmed popup is labelled by `gpt-4o-mini` as `settings | accept | reject | acknowledge | other`, cached by normalised text.
5. **Pick the reject button with regex, not with the LLM.** `classifyButtons` → `isRejectButton` = `classifyButtonTextRegex(text) === 'reject'`. Only popups with `llmMatch` are used, and only their regex-reject buttons. The LLM button labels feed the labelled dataset (§1.3), not the click decision.
6. **Emit or update a rule.** In [`generation.js`](https://github.com/duckduckgo/tracker-radar-collector/blob/main/post-processing/generate-autoconsent-rules/generation.js), each reject button produces the template above plus a Playwright spec (`testOptIn: false, testSelfTest: true, onlyRegions: [region]`). Existing rules for the same site and region are overridden unless the selector is identical. Review notes are raised for: several new rules for one site, several existing rules in one region, a rule previously edited by hand, and a host change on redirect.
7. **LLM audit of the classifier.** [`verification.js`](https://github.com/duckduckgo/tracker-radar-collector/blob/main/post-processing/generate-autoconsent-rules/verification.js) sends the whole list of "reject" texts to `gpt-4.1-nano` with the question "which of these might NOT be reject?". It sends the "other" texts with the question "which might be reject?". This is a batch false-positive and false-negative review, not a per-site gate.
8. **Human review.** Output is a PR to autoconsent: #802 lists every new, overridden, and region-specific rule. E2E tests then run in Jenkins in 9 regions with screenshots ([`verify-pr` skill](https://github.com/duckduckgo/autoconsent/blob/main/.agents/skills/verify-pr/SKILL.md)).

**Limits that matter for us.** The generator cannot produce multi-layer rules ("Settings → Reject all") or untick legitimate-interest toggles. It cannot produce a meaningful `test` either: the check is "button gone", not "consent stored as refused". Selectors are long structural paths (`div:nth-child(2):not([id]) > …`). The autoconsent guidelines discourage such paths for hand-written rules because they are brittle. `generation.js` also notes that a site can show several popups or reject buttons, so one site can end up with several rules.

### The labelled dataset and benchmark (reusable)

- [`data/labelled-button-texts.csv`](https://github.com/duckduckgo/autoconsent/blob/main/data/labelled-button-texts.csv) holds about 7,000 rows of normalised button text with occurrence counts and labels. Top rows: "privacy policy" (4,779, other), "accept all" (3,503), "reject all" (2,991).
- Process ([tracker-radar-collector `post-processing/README.md`](https://github.com/duckduckgo/tracker-radar-collector/blob/main/post-processing/README.md)): collect texts from crawls, label them with the LLM ([`label-button-texts.js`](https://github.com/duckduckgo/tracker-radar-collector/blob/main/post-processing/label-button-texts.js), `OPENAI_API_KEY`), "manually review and correct labels", then tune the regexes in [`lib/heuristic-patterns.ts`](https://github.com/duckduckgo/autoconsent/blob/main/lib/heuristic-patterns.ts).
- The benchmark gate is `tests-wtr/heuristics/button-classification-accuracy.test.ts`: **no false positives** and **>90% occurrence-weighted accuracy per label** (AGENTS.md).
- The classifier is exported DOM-free as `@duckduckgo/autoconsent/heuristics` (`classifyButtonTextRegex`, `classifyPopup`, `cleanButtonText`). It was added in [#1606](https://github.com/duckduckgo/autoconsent/pull/1606) (v16.51.0, 2026-10-13), so it runs in Node or in our backend.

### Heuristic mode: Decline without a rule

From [`lib/types.ts`](https://github.com/duckduckgo/autoconsent/blob/main/lib/types.ts) and [`lib/heuristic-classify.ts`](https://github.com/duckduckgo/autoconsent/blob/main/lib/heuristic-classify.ts):

| `heuristicMode` | Clicks |
|---|---|
| `off` (default) | nothing |
| `reject` | the reject button, if the popup has one |
| `tier1` | an "acknowledge" button (OK, Close) if there is no reject and no settings button |
| `tier2` | the single "accept" button if there is no reject, acknowledge, or settings button |

`classifyPopup` gives priority in this order: any reject → `reject`; any settings → `none` (leave it for a rule); acknowledge → `tier1`; exactly one accept → `tier2`. Reject-only mode came in [#1044](https://github.com/duckduckgo/autoconsent/pull/1044) (v14.39.0, 2025-12-02). The tiers came in [#1390](https://github.com/duckduckgo/autoconsent/pull/1390) (v15.0.0, 2026-06-20). Its review note says: "Tier2 can auto-click accept on consent banners when no reject path exists". `tier1` is a **Dismiss** in our domain terms, which CONTEXT.md says is never enough for a Consent Banner. `tier2` is an Accept.

## 2. Other tools and research

### BannerClick (Rasaii et al., MPI Saarland)

- Papers: "Exploring the Cookieverse", PAM 2023 ([arXiv 2302.05353](https://arxiv.org/abs/2302.05353)); "Thou Shalt Not Reject", IMC 2023 ([arXiv 2310.01108](https://arxiv.org/abs/2310.01108)). Code: [mohammadmahdijavid/bannerclick](https://github.com/mohammadmahdijavid/bannerclick), built on OpenWPM, Python/Selenium.
- **Method.** It finds elements containing words from an 80-word corpus in 12 languages. It walks up to a `position: fixed` or positive-`z-index` ancestor, then narrows to the "optimal" container. Iframes and shadow roots are searched. If nothing is found and the page is not in English, it translates the page and retries. Buttons are matched against `accept_words` / `reject_words` / `setting_words` ([`utility/dictWords.py`](https://github.com/mohammadmahdijavid/bannerclick/blob/main/bannerclick/utility/dictWords.py)). To reject through settings, it opens settings and then searches the **whole body** for a reject word. A code comment says this "causes click on wrong reject btns like: statista.com, politico.com, sap.com" (`bannerdetection.py`, `interact_with_banner`).
- **Accuracy (PAM '23, §3):** detect 99%, accept 97%, reject **87.4%** (377 of 524 top-1k banners; 81 had no reject option).
- **Failure modes they report:** 13 wrong accept clicks on buttons such as "**NOT Accept**", because "BannerClick does not consider the text's semantics". Most failed rejections (38 sites) came from **multi-select mechanisms**, meaning per-purpose toggles rather than a reject button.

### CookieEnforcer (Khandelwal, Nayak, Harkous, Fawaz)

- [arXiv 2204.04221](https://arxiv.org/abs/2204.04221) (2022-04-08), published at USENIX Security 2023.
- **Method.** A BERT classifier finds the notice. An "Analyzer" discovers controls by simulated Tab presses, **clicks each candidate and re-queries for newly injected elements, recursively**, and assigns each element a role (configure / reveal another notice / reveal settings / submit). **T5-Large** then outputs the sequence of clicks that disables all non-essential cookies.
- **Accuracy:** detector F1 0.97; Analyzer 97%; decision model 95% exact match; end-to-end **91%** (227/250). The USENIX version reports 93.7%.
- **Failure modes:** shadow roots, controls not reachable by Tab, settings on a separate page (filtered out, e.g. LinkedIn), input truncation on pages with many toggles, Accept-only banners, and notices that change between generation and enforcement. **No runtime check of stored consent.** Evaluation compared the click sequences with human annotations.

### Consent-O-Matic (Aarhus University, CAVI)

- [cavi-au/Consent-O-Matic](https://github.com/cavi-au/Consent-O-Matic). Its rules are **hand-written** per CMP (204 files in `rules/`), with no automated generation. Rules map toggles to purpose categories D/A/B/E/F/X so a user can opt in per category. Some rules target legitimate-interest controls explicitly (e.g. `[id*=LegitimateInterests]` in `rules/almacmpv2.json`).
- Its CHI '25 paper, [arXiv 2503.19655](https://arxiv.org/abs/2503.19655), covers 254,148 sites in 31 countries with **word matching**, not an LLM. Reported F1: interface 0.99, accept 0.98, reject 0.99. Reject options are only looked for on the first layer. **27% of reject options are "Accept necessary"-type wording**, which their classifier counts as reject. Purpose-toggle detection is much weaker (F1 0.82, checkbox state 0.67).
- autoconsent **dropped support for Consent-O-Matic rules** in [#1393](https://github.com/duckduckgo/autoconsent/pull/1393) (v16.0.0, 2026-06-23).

### Bouhoula et al., USENIX Security 2024

- [Paper](https://www.usenix.org/conference/usenixsecurity24/presentation/bouhoula). The crawler classifies `role=button` elements into six labels with a fine-tuned BERT trained on 2,353 annotated elements: 95.1% accuracy, F1 0.91 ([slides](https://usenix.org/system/files/usenixsecurity24_slides-bouhoula.pdf)).
- Finding: 65.4% of sites that offer a reject option likely still collect data after rejection. **A banner disappearing is not evidence that consent was stored as refused.**

### Brave Cookiecrumbler (2025-04-24)

- [Blog](https://brave.com/privacy-updates/33-cookiecrumbler/), [code](https://github.com/brave/cookiecrumbler) (MPL-2.0). Puppeteer runs through regional proxies and collects overlay candidates. An LLM gives a **boolean** "is this a cookie consent notice" on the first 500 characters of `innerText`. The call uses `temperature: 0`, `seed: 1`, `top_p: 0`, `max_tokens: 2` and falls back to a keyword list on error ([`src/text-classification.mjs`](https://github.com/brave/cookiecrumbler/blob/main/src/text-classification.mjs)). Models are configured through LiteLLM (Llama 3 8B/11B/90B, Claude 3.5 Sonnet, Claude 3 Haiku).
- Output is **cosmetic hide filters**, not Decline clicks. Results are published as GitHub issues and humans review them before anything ships. The post reports no accuracy figures.

### LLM browser agents and consent banners

- **"Invisible Consent"** (Saito, Kataiwa, Takashima, Ohki; CHI EA '26, [DOI 10.1145/3772363.3799048](https://doi.org/10.1145/3772363.3799048), [lab page](https://sec.inf.shizuoka.ac.jp/publications/20260413_SKTO2026/)): agents default to accepting. **Even with an explicit deny-all instruction they accepted in 14.4% of trials** in which they interacted with the banner. The rate varied with prompt wording and banner design.
- **"Privacy Practices of Browser Agents"** (Ukani, Haddadi, Shamsabadi, Snyder; [arXiv 2512.07725](https://arxiv.org/abs/2512.07725), 2025-12-08), testing a Cookie Script banner with equal-weight "accept all" and "deny all" buttons:

  | Agent | Banner doesn't block content | Banner obscures content | Must interact to continue |
  |---|---|---|---|
  | Claude Computer Use | Rejects | Closes | **Accepts** |
  | ChatGPT Agent | Bypasses | Closes | **Accepts** |
  | Nova Act | Ignores | **Accepts** | **Accepts** |
  | Browser Use (Chromium) | **Accepts** | **Accepts** | **Accepts** |
  | Claude for Chrome | Ignores | Rejects | Rejects |
  | Project Mariner | Asks the user, says it will accept | Same | Same |

  **The "must interact" case is exactly Detection's situation**, and it is where most agents switched to Accept. "Closes" (a Dismiss) is the second most common outcome.
- **Dark patterns** fool LLM web agents in about **41%** of single-pattern cases (Ersoy et al., [arXiv 2510.18113](https://arxiv.org/abs/2510.18113), IEEE S&P 2026). Preselection and trick wording are the hardest ([SusBench, arXiv 2510.11035](https://arxiv.org/abs/2510.11035)). Both describe common consent-banner designs.

I found no published system that uses an LLM agent to **write** multi-step Decline rules and report a success rate. DuckDuckGo's triage PRs (§3) are the closest example, but the pipeline is internal and has no published metrics.

## 3. DuckDuckGo's agent-authored rules (the closest analogue)

- Since at least 2026-03-27, autoconsent has had `AGENTS.md` and a `CLAUDE.md` that includes it, plus agent skills: `proxy-testing`, `oxylabs-testing`, `publicwww-search`, `verify-pr`, `optimize-button-patterns`. Its changelog has an "AI / Agent Workflow" section, and many PRs are co-authored by `@cursoragent` or `@claude`.
- The bot `daxtheduck` opens PRs titled "Rule update: …" or "New rule …" whose bodies say *"Automated autoconsent rule update from CPM triage"*. Examples: [#2042](https://github.com/duckduckgo/autoconsent/pull/2042), merged 2026-10-22, is a multi-layer DPG Media fix ("clicks 'Alles weigeren' directly when the first layer has it… Otherwise it opens 'Instellen' and clicks 'Alles weigeren'"). [#2174](https://github.com/duckduckgo/autoconsent/pull/2174), merged 2026-10-26, is a new generic `smartweb` CMP rule that unticks checked optional categories and saves. A maintainer (`@muodov`) is co-author or reviewer on each. Which model or harness drives them is not public.
- Rules from `AGENTS.md` that apply directly to Detection:
  - **"Never click TIER2 buttons in the `optOut` rule… Clicking that button from a JSON rule is an opt-in disguised as a fix. If the popup has no reject, dismiss, or acknowledge control, do not 'handle' it by accepting."**
  - Paywalls ("pay or agree"), age gates, login walls, and newsletter prompts are out of scope. Click through such a gate to see whether a consent popup sits behind it.
  - Prefer a generic CMP rule over a `urlPattern` rule. Identify the CMP by class prefixes, script sources, and cross-site prevalence.
  - Selector stability: data attributes > stable IDs > class substrings > structural CSS > XPath. **No CSS-module hashes.** Use array selectors to pierce shadow DOM and same-origin iframes.
  - `detectCmp`/`detectPopup` must not wait. Use `waitForThenClick` with `retry` instead of fixed `wait`, and cap any `wait` at 1 s.
  - Rule-step traps: use `check: "none"` rather than `negated`; `cookieContains` is a substring match and cannot see HttpOnly cookies.
  - Verification: **look at the screenshots**, because "sometimes a rule reports success, but the popup is not actually handled". **Reload and confirm the rule no longer matches**, since over-detection causes reload loops. Test the core regions US, GB, DE plus the reported region. `selfTest` is optional. A generic rule needs at least two spec sites.
  - Legitimate interest in existing rules is handled by unticking every checked box, e.g. `{ "click": ".fc-preference-consent:checked,.fc-preference-legitimate-interest:checked", "all": true }` ([`fundingchoices.json`](https://github.com/duckduckgo/autoconsent/blob/main/rules/autoconsent/fundingchoices.json)).

## 4. Failure modes seen across sources

| Failure mode | Where it was seen | Defence that worked |
|---|---|---|
| Accept clicked instead of Decline | Agents: 14.4% despite instruction; 4 of 8 agents | autoconsent: regex classifier picks the button; "never TIER2" rule; human review |
| Negation / ambiguous wording ("NOT Accept", "continue without accepting", "Accept necessary only") | BannerClick (13 sites); Nouwens '25 (27% of rejects are "accept necessary") | DDG label prompt has explicit rules: necessary-only → reject, negation → reject |
| "Allow selection" / "Save" mistaken for a reject, or the reverse | DDG label prompt; smartweb rule: `button[name=accept]` is *save selection* after unticking | Separate "confirm selection" from "open settings"; check toggle state before saving |
| Reject only on the second layer, or via multi-select toggles | BannerClick (38 sites); CookieEnforcer; Nouwens (first layer only) | CookieEnforcer click-and-observe discovery; hand or agent-written multi-step rules (#2042) |
| Legitimate-interest toggles left on | Consent-O-Matic, autoconsent rules handle them explicitly | Untick every `:checked` purpose and LI input before "save" |
| Wrong reject after searching the whole page | BannerClick code comment (statista, politico, sap) | Search only inside the popup container |
| Non-consent overlays (age gates, paywalls, notifications) | DDG & Brave prompts list them as negatives | Negative examples in the prompt; `DETECT_NEVER_MATCH_PATTERNS` |
| Banner gone but consent not refused | Bouhoula: 65.4% still collect data | Verification beyond "popup gone" (cookie or self-test); none of the tools checks this fully |
| Region- or bot-dependent banners | DDG (9 regions + Oxylabs retry), Brave (regional proxies), CookieEnforcer (bot detection) | Regional proxies; captcha-solving fallback |
| Brittle selectors | DDG generated rules use full structural paths | AGENTS.md selector ordering; no hashes |

## 5. Prompting and verification techniques that worked

1. **Narrow LLM jobs with structured output.** DDG uses zod response formats: one boolean, or one enum label. Brave uses `max_tokens: 2`, temperature 0, a fixed seed, and a keyword fallback. Neither gives the LLM free choice of what to click.
2. **Explicit tie-break rules in the prompt.** DDG's button prompt orders reject > accept > settings > acknowledge > other. It lists multilingual examples per label and adds edge-case rules: necessary-only → reject; "do not sell" → reject; negation → reject; allow/accept + selection → accept; customise/manage → settings; "Cancel" → other; anything about payment, subscription, or age → other.
3. **Two independent classifiers must agree.** DDG generates a rule only when the LLM confirms the popup *and* the regex says the button is reject. Disagreements go to the labelled CSV for human correction.
4. **Benchmark gates.** A labelled corpus must show zero false positives and >90% per-label accuracy before any pattern change ships.
5. **Batch LLM self-audit.** `verification.js` asks a cheap model to list likely misclassifications in each class. Those go to humans; they do not gate automatically.
6. **Run the real engine, look at screenshots, reload.** autoconsent's E2E runner runs the rule, checks the self-test, takes screenshots per region, and confirms the rule stops matching after reload.
7. **Human review is universal.** DDG (PR review and manual label correction), Brave (visual review and filter-list maintainers), and CookieEnforcer (screenshot review) all keep a person in the loop. This matches our ADR-0006.

## 6. What Detection can reuse

These are recommendations from this research, not decisions.

- **Feed autoconsent's `AGENTS.md` rule-authoring sections and `docs/rule-syntax.md` to the Detection LLM as reference.** They are MPL-2.0. Quoting them in a prompt is not modifying autoconsent's files, but keep attribution.
- **Use an out-of-LLM Decline guard.** After the agent proposes a rule, run `classifyButtonTextRegex` from `@duckduckgo/autoconsent/heuristics` on the **visible text** of every element the `optOut` steps click. Reject a Draft whose final click classifies as `accept`, unless the rule first unticks `:checked` purpose or LI inputs, as in the smartweb "save selection" case. Flag `other` and `acknowledge` for Admin attention. Never allow a click on a popup that `classifyPopup` rates `tier2`.
- **Verify beyond "popup gone".** Run the rule with `autoAction: 'optOut'` in Playwright. Require `optOutSucceeded`, screenshots, and a reload with no re-detection. Diff cookies and storage against an `optIn` run where one exists. Where `__tcfapi` exists, check that purpose consents are false. That last check is our own idea; no prior tool does it.
- **Steer the model toward generic CMP rules and stable selectors**, not DDG's single-click template with structural selectors.
- **Try `heuristicMode: 'reject'` before calling the LLM.** If autoconsent's heuristic already Declines the banner, no rule is needed. Never use `tier1` or `tier2`: those are Dismiss and Accept.

## Sources

- duckduckgo/autoconsent @ `96d95848` (2026-10-26): [`AGENTS.md`](https://github.com/duckduckgo/autoconsent/blob/main/AGENTS.md), [`lib/heuristic-classify.ts`](https://github.com/duckduckgo/autoconsent/blob/main/lib/heuristic-classify.ts), [`lib/types.ts`](https://github.com/duckduckgo/autoconsent/blob/main/lib/types.ts), [`lib/utils.ts`](https://github.com/duckduckgo/autoconsent/blob/main/lib/utils.ts), [`rules/generated/`](https://github.com/duckduckgo/autoconsent/tree/main/rules/generated), [`data/labelled-button-texts.csv`](https://github.com/duckduckgo/autoconsent/blob/main/data/labelled-button-texts.csv), [`CHANGELOG.md`](https://github.com/duckduckgo/autoconsent/blob/main/CHANGELOG.md); PRs [#793](https://github.com/duckduckgo/autoconsent/pull/793), [#802](https://github.com/duckduckgo/autoconsent/pull/802), [#858](https://github.com/duckduckgo/autoconsent/pull/858), [#1044](https://github.com/duckduckgo/autoconsent/pull/1044), [#1390](https://github.com/duckduckgo/autoconsent/pull/1390), [#1393](https://github.com/duckduckgo/autoconsent/pull/1393), [#1606](https://github.com/duckduckgo/autoconsent/pull/1606), [#2042](https://github.com/duckduckgo/autoconsent/pull/2042), [#2174](https://github.com/duckduckgo/autoconsent/pull/2174).
- duckduckgo/tracker-radar-collector @ `f35cfe0` (2026-10-23): [`post-processing/generate-autoconsent-rules/`](https://github.com/duckduckgo/tracker-radar-collector/tree/main/post-processing/generate-autoconsent-rules), [`post-processing/README.md`](https://github.com/duckduckgo/tracker-radar-collector/blob/main/post-processing/README.md), [`collectors/CookiePopupsCollector.js`](https://github.com/duckduckgo/tracker-radar-collector/blob/main/collectors/CookiePopupsCollector.js).
- Rasaii et al., "Exploring the Cookieverse", PAM 2023, [arXiv 2302.05353](https://arxiv.org/abs/2302.05353); "Thou Shalt Not Reject", IMC 2023, [arXiv 2310.01108](https://arxiv.org/abs/2310.01108); [BannerClick code](https://github.com/mohammadmahdijavid/bannerclick).
- Khandelwal et al., "CookieEnforcer", [arXiv 2204.04221](https://arxiv.org/abs/2204.04221) (2022), USENIX Security 2023.
- Nouwens et al., "A Cross-Country Analysis of GDPR Cookie Banners and Flexible Methods For Scraping Them", CHI 2025, [arXiv 2503.19655](https://arxiv.org/abs/2503.19655); [Consent-O-Matic](https://github.com/cavi-au/Consent-O-Matic).
- Bouhoula et al., "Automated Large-Scale Analysis of Cookie Notice Compliance", [USENIX Security 2024](https://www.usenix.org/conference/usenixsecurity24/presentation/bouhoula).
- Brave, "Cookiecrumbler", [blog 2025-04-24](https://brave.com/privacy-updates/33-cookiecrumbler/), [code](https://github.com/brave/cookiecrumbler).
- Saito et al., "Invisible Consent: Browser Automation by LLM Agents is Not Privacy-aware", CHI EA 2026, [DOI](https://doi.org/10.1145/3772363.3799048).
- Ukani et al., "Privacy Practices of Browser Agents", [arXiv 2512.07725](https://arxiv.org/abs/2512.07725) (2025-12-08).
- Ersoy et al., "Investigating the Impact of Dark Patterns on LLM-Based Web Agents", [arXiv 2510.18113](https://arxiv.org/abs/2510.18113); Guo et al., "SusBench", [arXiv 2510.11035](https://arxiv.org/abs/2510.11035).
