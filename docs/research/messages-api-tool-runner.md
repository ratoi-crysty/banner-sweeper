# What the Messages API Tool Runner gives a browser-driving agent

Research for [#9](https://github.com/ratoi-crysty/banner-sweeper/issues/9) (part of map #6). Date: 2026-10-26.

**Question.** For Detection (an LLM drives a remote Playwright browser through *our own* narrow tools, writes an autoconsent-format Rule, verifies it), what does the Anthropic Messages API plus the TypeScript SDK's Tool Runner (`@anthropic-ai/sdk`, `client.beta.messages.toolRunner`) give us, and what do we build ourselves?

**Sources.** Every claim below is tagged with its source. `[skill:…]` is a file in the bundled `claude-api` skill (Anthropic's reference for the current API, cached 2026-10-06). `[docs:…]` is a page on `platform.claude.com/docs/en/…`. `[sdk:helpers.md]` is <https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md>. The full URL list is at the end. No paid API calls were made, so nothing here was measured. The cost figures are estimates built from list prices.

---

## TL;DR

| Concern | The runner/API gives us | We build |
|---|---|---|
| Loop | `toolRunner()` runs the request, tool, and result loop. The `for await` body is a per-turn hook. | Job state, the submit detector, and budgets |
| Tools | `betaZodTool` (Zod schema plus `run`). Inputs are validated before `run`. `ToolError` sends `is_error: true` back to the model. | The tool implementations over Playwright |
| Stop | `max_iterations` (default: **no limit**), an `AbortSignal`, and `break` | A `submit_rule` sentinel, plus turn, token, and wall-clock caps |
| Images and DOM | `run` can return content blocks, including `image` | Snapshot trimming and screenshot resizing |
| Context | Server-side context editing (`clear_tool_uses_20250919`) and compaction (`runner.compactBeforeNextTurn()`) | Small tool outputs by design. Client-side pruning is **not allowed** (preserved thinking). |
| Final Rule | `strict: true` tools and `output_config.format` exist, but the autoconsent schema is too complex for both | A validating `submit_rule` tool (Zod on our side) that returns errors to the model |
| Caching | `cache_control`, automatic plus explicit breakpoints | Byte-stable `system` and `tools`. Per-job data goes in `messages`. |
| Refusals | `stop_reason: "refusal"`, `stop_details`, and server-side `fallbacks: "default"` | A per-turn `stop_reason` check (the runner does **not** do it for us) |
| Errors | Typed errors and SDK retries (`maxRetries` defaults to 2 for 408/409/429/5xx/network) | Job-level requeue and failure classification |
| Streaming | `stream: true` on the runner | Only needed for live progress in the UI |

**Recommended start:** `claude-opus-5-5`, effort `medium` set explicitly, adaptive thinking (omit `thinking`), `max_tokens: 16000` per turn, non-streaming, `thread: false`, `max_iterations: 30`, and `fallbacks: "default"`. **Estimated cost: about $0.45–$1.50 per job** (10–30 turns), about $0.90 at 20 turns. Sonnet 5.5 is about half that and Haiku 5.5 about 1/30. Choose the model with an eval, not up front.

---

## 1. Defining tools, per-turn hooks, stop conditions

### Defining tools

- `betaZodTool({ name, description, inputSchema: z.object(...), run })` from `@anthropic-ai/sdk/helpers/beta/zod`, passed to `client.beta.messages.toolRunner({ model, max_tokens, tools, messages })` [skill: typescript/claude-api/tool-use.md]. `betaTool()` takes raw JSON Schema instead, and `betaStandardSchemaTool()` takes any Standard Schema library [sdk:helpers.md].
- **Validation:** with `betaZodTool` the runner validates each tool input against the Zod schema and **never calls `run` on input that fails**. `betaTool()` does *not* validate at runtime [skill: shared/tool-use-concepts.md → Eager input streaming; typescript/claude-api/streaming.md]. → Use `betaZodTool` for all of our tools.
- Extra tool-definition fields (`strict`, `cache_control`, …) are passed through as given [sdk:helpers.md]. `eager_input_streaming` must be spread onto the returned object: `{ ...betaZodTool({...}), eager_input_streaming: true }` [skill: shared/tool-use-concepts.md].
- `run` can be async and can return a string or an **array of content blocks** (for example `{ type: 'image', source: { type: 'base64', media_type: 'image/png', data } }`) [sdk:helpers.md].
- Tool errors: throw `ToolError` (from `@anthropic-ai/sdk/resources/beta/messages`). The runner catches it and returns the content with `is_error: true` [sdk:helpers.md]. helpers.md does **not** document what happens when `run` throws a plain `Error`, so wrap every handler and convert failures to `ToolError`.
- Tool descriptions should say *when* to call the tool. Recent Opus models reach for tools more conservatively, and trigger conditions measurably raise the call rate [skill: shared/tool-use-concepts.md]. Keep the set small and focused [same].

### Per-turn hooks

The runner is not a black box. Each `for await (const message of runner)` iteration yields the assistant message **before** its tools run. You can inspect it and intervene [skill: shared/tool-use-concepts.md → Tool Runner vs Manual Loop]. Runner methods [sdk:helpers.md]:

| Method / option | Use for Detection |
|---|---|
| `setMessagesParams(params \| fn)` | Change parameters between turns. `system` and `tools` can't change mid-run unless `thread: false`. |
| `pushMessages(...)` | Append messages (for example a `pause_turn` resume, or a mid-conversation `role: "system"` nudge) |
| `generateToolResponse(signal?)` | Get the tool results for the last assistant message (intercept or inspect them) |
| `params` | Read-only view of the current conversation. Persist it as the job transcript. |
| `setRequestOptions({ signal, headers })` | Swap the abort signal or headers |
| `done()` / `runUntilDone()` / `await runner` | Final message |
| `addTools()` / `removeTools()` | Needs beta `inline-tools-2026-09-15`. Not needed: fix the tool set per job. |
| `max_iterations` | Cap on tool iterations. **Default: no limit.** |
| `thread` | Defaults to a server-side **message thread (beta)**. `thread: false` sends the full history each request. |
| `stream: true` / `runToolsEagerly` | Per-turn `BetaMessageStream` / start tools as soon as their call closes |

**`thread` default (verify against the installed SDK version):** helpers.md says the runner keeps its conversation in a server-side message thread by default, which is beta, and says nothing about retention or caching [sdk:helpers.md]. We want the full transcript locally (audit, replay, an admin view of "how the Rule was found"), and the same shape for an Ollama backend. → Pass **`thread: false`**.

### Stop conditions

- **Natural end:** iteration stops when Claude makes no more tool calls [skill: typescript/claude-api/tool-use.md].
- **`max_iterations`:** no default, so we **must** set it (start at about 30). What happens at the cap is undocumented beyond "ends the run" [sdk:helpers.md], so check the final `stop_reason`.
- **Abort:** `toolRunner(params, { signal })`. The signal reaches API calls *and* tool `run` functions (`context?.signal?.throwIfAborted()`) [sdk:helpers.md]. → Use it for the job's wall-clock timeout.
- **`break`** out of the loop [sdk:helpers.md].
- **"Submit Rule" ends the loop:** forced `tool_choice` (`any` or `tool`) returns **400 on Claude Opus 5.5 / Sonnet 5.5** [skill: shared/model-migration.md → Migrating to Claude Opus 5.5, Breaking change 2]. So we can't force the final call. Use `tool_choice: auto`, tell the model in the system prompt to finish by calling `submit_rule`, and check that it did. Pattern: `submit_rule.run()` validates and stores the Rule in job state. The loop body checks `job.submitted` after each iteration and `break`s. If the run ends without a submission, the job fails as "no rule".
- **The runner does not apply stop-reason rules.** Check every iteration: stop on `refusal`, treat `max_tokens` on a turn that has a `tool_use` as a failed turn (a truncated input can still pass schema validation), and resume `pause_turn` yourself (only relevant if we add server tools) [skill: typescript/claude-api/streaming.md; typescript/claude-api/tool-use.md → Server tools with the tool runner].
- Optional pacing: **task budgets** (beta `task-budgets-2026-03-13`, `output_config.task_budget`, minimum 20,000, supported on Opus 5.5 / Sonnet 5.5 / Haiku 5.5) give the model an advisory token countdown so it wraps up instead of being cut off [skill: SKILL.md → Task Budgets]. The hard cap stays ours: sum `usage` per iteration and `break`.

## 2. Screenshots, large DOM snapshots, keeping context small

### Returning them

- Images are valid inside `tool_result` content [docs: vision]. With the runner, return `[{ type: 'image', source: { type: 'base64', media_type, data } }]` from `run` [sdk:helpers.md].
- **Cost:** `⌈w/28⌉ × ⌈h/28⌉` visual tokens. Claude 4.7 and later (Opus 5.5 included) are on the high-resolution tier: long edge up to 2,576 px and up to 4,784 tokens. Larger images are downscaled [docs: vision]. A 1280×800 screenshot is **≈1,334 tokens** and 1920×1080 is ≈2,691.
- Limits: 8000×8000 px, 10 MB base64 per image, a 32 MB request. Once a request carries **more than 20 images**, including screenshots in earlier `tool_result`s, a stricter per-image dimension limit applies. The docs advise ≤2000 px per side [docs: vision]. → Use a 1280×800 viewport and JPEG or WebP, so we never hit it.
- DOM snapshots are text that *we* produce, so the cheapest lever is at the source: a compact, ref-annotated element list, optional `selector` scoping, and a hard character cap. Anthropic's own browser toolset caps `read_page` at 50,000 characters and supports `filter`/`depth`/`ref` scoping, and notes that a tree read usually costs fewer tokens than a screenshot [docs: browser-use-tool]. Copy that design. Prefer text tools and take screenshots on demand.

### Context editing vs compaction

- **Do not prune old tool results or screenshots client-side.** On Opus 5.5 / Sonnet 5.5 / Haiku 5.5, thinking blocks are bound to the exact conversation prefix. Deleting or editing an earlier turn invalidates every later thinking block, and for **accounts created on or after 2026-08-31 this is a 400** on every platform [skill: shared/model-migration.md → Opus 5.5 Breaking change 3; Fable 5.1 Breaking change 3]. The Sonnet 5.5 computer-use notes say the same thing about screenshots: "don't prune old screenshots on the client … resize screenshots to 2000 px or less per side and use server-side tool result clearing instead" [skill: shared/model-migration.md → Sonnet 5.5 Breaking change 4]. The tool runner appends only, so it is safe by default.
- **Context editing** (`clear_tool_uses_20250919`, beta `context-management-2025-06-27`, `context_management.edits`). Fields: `trigger` (default 100,000 input tokens), `keep` (default 3 tool uses), `clear_at_least`, `exclude_tools`, and `clear_tool_inputs` (default false). Cleared results become placeholder text, the client keeps the full history, and edits are reported in `context_management.applied_edits` [docs: context-editing]. It does not count as a history edit for preserved thinking [skill: shared/model-migration.md]. **It is a context-window tool, not a savings lever.** Every clear rewrites the cached prefix, and in Anthropic's measured run it cost more than it saved [skill: shared/cost-optimization.md §2.3].
- **Compaction:** in the TS runner, call `runner.compactBeforeNextTurn({ type: 'summarize', instructions? })` with beta `compact-2026-09-04`. It runs after the current turn's tools and replaces the history with the summary. Compaction calls don't count toward `max_iterations`, and their cost shows in `usage.iterations` [sdk:helpers.md]. The older `compactionControl` option is **deprecated** [docs: context-editing]. On-demand compaction is the recommended form [docs: compaction]. It pays only on long sessions [skill: shared/cost-optimization.md §2.3].
- **Verdict:** a Detection job (10–30 turns, roughly 50–120K tokens of context with small tool outputs) should need **neither** in v1. Keep tool outputs small at the source. If jobs grow, add `clear_tool_uses_20250919` with a high `trigger` (≈120K), `clear_at_least` (≈20K), and `exclude_tools: ["try_rule", "submit_rule"]`, so clears are rare and the verification evidence stays. Use compaction only as a runaway-job escape hatch.

## 3. Getting a schema-valid final Rule out

- **`strict: true`** on a tool guarantees the input matches `input_schema`, and **`output_config.format`** constrains the final text. Both can be combined with tools in one request [docs: structured-outputs].
- **Neither fits the autoconsent Rule.** Strict grammar limits are: at most 20 strict tools, **24 optional parameters** in total, 16 union-typed parameters, **no recursive schemas**, no `minLength`/`maximum`, and `additionalProperties: false` required [docs: structured-outputs]. autoconsent's `AutoConsentRuleStep` is an intersection of about 17 `Partial<…>` step types, with about 30 optional keys, and it is **recursive** (`IfRule.then`/`else`, `AnyRule.any` hold step arrays) [autoconsent `lib/rules.ts`]. Changing `output_config.format` also invalidates the prompt cache [docs: structured-outputs].
- **Recommendation:** make `submit_rule` (and `try_rule`) take the Rule as a non-strict Zod schema that mirrors autoconsent's types, using `z.lazy` for the recursion. `betaZodTool` rejects malformed input before `run`. Inside `run`, apply our protocol constraints: no `eval` steps (ADR-0002/0003), selector sanity, and a Match for the target Site. Then throw `ToolError(listOfProblems)` so the model fixes the Rule and resubmits. Use `strict: true` only on the small primitive tools (click, query selector), where it is cheap and well within the limits.
- **Do not add a "reasoning" field** to the Rule or submit schema. Asking the model to write out its reasoning can be declined with `stop_details.category: "reasoning_extraction"` [docs: structured-outputs; skill: shared/model-migration.md → Opus 5.5 Safeguards]. Ask for a short `explanation` instead, or read `thinking` with `display: "summarized"`.

## 4. Prompt caching across turns and jobs

- Caching matches on prefix, and the render order is `tools` → `system` → `messages`. Any byte change invalidates everything after it [skill: shared/prompt-caching.md].
- **Within a job:** the recommended agent-loop shape is one explicit `cache_control` breakpoint on the last `system` block, plus top-level automatic `cache_control: { type: "ephemeral" }` for the growing tail [skill: shared/prompt-caching.md → Automatic vs explicit breakpoints]. Turns start well under 5 minutes apart, so the default 5-minute TTL stays warm and each read refreshes it [same → Choosing the TTL].
- **Across jobs:** if `tools` and `system` are byte-identical for every job, jobs that start within 5 minutes of each other read the shared prefix. The URL and Hint must go in the first **user message**, never in `system`. Serialize tools deterministically (fixed order). Never put dates or job IDs in `system`, and keep effort and thinking fixed per route [skill: shared/prompt-caching.md → Silent invalidators; Invalidation hierarchy]. The minimum cacheable prefix on Opus 5.5 / Sonnet 5.5 / Haiku 5.5 is 512 tokens [same → API reference].
- The cross-job gain is small: about 6K tokens × $3.80/MTok saved ≈ $0.02 per job on Opus 5.5. The **within-job** gain is the big one (about 4× on total job cost, §6). The 1-hour TTL (2× write) is not worth it here.
- **Verify** with `usage.cache_read_input_tokens` and `cache_creation_input_tokens`. A healthy loop reads the whole prior prefix and writes only the last turn's delta [skill: shared/prompt-caching.md → Verifying cache hits]. Add a standing check: log usage per iteration and alert when a job has zero reads after turn 2.
- Mid-job instruction changes (for example "you have 3 turns left") belong in an appended `{ role: "system" }` message, not an edit to `system`. This is supported on Opus 5.5 / Sonnet 5.5 with no beta header, and it is also the injection-safe operator channel [skill: shared/prompt-caching.md → Mid-conversation system messages].

## 5. Refusals, fallbacks, typed errors, retries, streaming

### Refusals and fallback

- Opus 5.5, Sonnet 5.5, and Haiku 5.5 run safety classifiers. A decline is **HTTP 200** with `stop_reason: "refusal"` and an informational `stop_details.category` (`cyber`, `bio`, `reasoning_extraction`, …). Branch on `stop_reason`, never on `stop_details` [skill: shared/model-migration.md → refusal stop reason; docs: refusals-and-fallback]. A Rule that clicks "Reject all" is benign, but wording like "bypass" or "evade" in prompts or Hints could brush the `cyber` classifier.
- **Server-side fallback:** `fallbacks: "default"` with beta `server-side-fallback-2026-07-01`. A declined request is re-run on the model Anthropic recommends for that category, inside the same call. It is in beta on the Claude API and Google Cloud (Anthropic managed). It triggers on policy declines only, never on 429 or 5xx. Responses carry `fallback` content blocks and a `fallback_message` entry in `usage.iterations`, and fallback turns are sticky for about 1 hour [docs: refusals-and-fallback; skill: shared/model-migration.md]. A fallback model **can't read Opus 5.5 thinking blocks**, so it re-plans [skill: Opus 5.5 Breaking change 3]. **Haiku 5.5 has no server-side fallback** [skill: Migrating to Claude Haiku 5.5].
- **Billing:** a refusal before any output is billed only in the categories `bio`, `frontier_llm`, and `reasoning_extraction`. Mid-stream refusals are billed normally [docs: refusals-and-fallback → How refusals are billed].
- Runner params are the regular beta message params, so `fallbacks` and `betas` should pass through. This was not exercised (no paid calls); confirm in the first integration test.

### Typed errors and retries

- The SDK retries 408/409/429/5xx and connection errors automatically. `maxRetries` defaults to 2. `timeout` is in **milliseconds** in TS [skill: SKILL.md → Client config; shared/error-codes.md].
- Catch from most specific to least, by class, never by message string: `Anthropic.BadRequestError` (fail the job, it's our bug), `AuthenticationError`/`PermissionDeniedError` (fail and alert), `RateLimitError` / `InternalServerError` (requeue with backoff once SDK retries are exhausted), `APIConnectionError` **before** `APIError` (in TS it is a subclass) [skill: shared/error-codes.md].
- Server-side fallback doesn't cover 429 or 529. Those are retried by the SDK and then by our queue.

### Streaming

- The runner supports `stream: true`: the outer loop yields one `BetaMessageStream` per turn, and `await stream.finalMessage()` gets the message [skill: typescript/claude-api/streaming.md]. With eager input streaming, unparseable JSON rejects the iteration, and recovery means rebuilding the runner from `runner.params` [same].
- Detection runs as a background job with small per-turn outputs, so **start non-streaming** with `max_tokens: 16000` (the skill's non-streaming default). Add `stream: true` only if the admin UI shows live progress. Opus 5.5 returns between-tool notes as `thinking` blocks that are empty by default, so live progress would also need `thinking.display: "updates"` (beta `thinking-display-updates-2026-08-18`) [skill: shared/model-migration.md → Text between tool calls].

## 6. Model and effort defaults; per-job cost model

### Defaults to start with

- **Model `claude-opus-5-5`** ($4 / $20 per MTok, cache read $0.20, 5-minute cache write $5) [docs: pricing]. Reasons: it is the current default model, it reads screenshots and charts much better than Opus 5 even at `low`, and it is more reliable at multistep computer use, matching Opus 5's success "in fewer steps and with roughly 40% fewer tokens" [skill: shared/model-migration.md → Opus 5.5 Capability improvements].
- **Effort `medium`, set explicitly.** It is Opus 5.5's API default, one level below Opus 5's `high` [skill: SKILL.md → Thinking & Effort]. Sweep `low` and `medium` on an eval before raising it.
- **Thinking:** omit it (adaptive is always on). `{type:"disabled"}` and `budget_tokens` return **400** on Opus 5.5 [skill: Opus 5.5 Breaking change 1].
- `tool_choice: auto` only (forced choice returns 400). No `temperature`/`top_p` (they return 400). No assistant prefill (400) [skill: shared/error-codes.md → Common Mistakes].
- Comparison candidates for the eval: `claude-sonnet-5-5` at `medium` ($2 / $10, cache read **$0.10** per the pricing page; the skill's cached table says $0.20) and `claude-haiku-5-5` ($0.10 / $0.50 up to 100K-token prompts, and $0.50 / $2.50 above that) [docs: pricing]. Keep one model per job: caches are model-scoped and a mid-job switch drops thinking blocks [skill: shared/prompt-caching.md].

### Cost model (estimate, not measured)

Let **S** be the static prefix (system plus tool definitions plus the tool-use system prompt of 286 tokens on these models [docs: pricing]), **d** the tokens appended per turn (tool result plus the previous assistant turn), **o** the output tokens per turn including thinking, and **N** the number of turns. With caching working:

```
cost ≈ P_write·(S + N·d) + P_read·(S·N + d·N(N−1)/2) + P_out·N·o
```

Assumptions: S ≈ 6K. d ≈ 3.8K (a mix of small JSON results, an occasional 5–8K-token DOM snapshot, and an occasional ≈1.3K-token screenshot). o ≈ 800 at `medium`.

| Model | N = 10 | N = 20 | N = 30 | N = 20, no caching |
|---|---|---|---|---|
| Opus 5.5 | ≈ $0.43 | ≈ $0.90 | ≈ $1.45 | ≈ $4.00 |
| Sonnet 5.5 | ≈ $0.21 | ≈ $0.44 | ≈ $0.70 | ≈ $2.00 |
| Haiku 5.5 | ≈ $0.01 | ≈ $0.03 | ≈ $0.05* | — |

\*Haiku 5.5 crosses the 100K-token prompt threshold around turn 25 under these assumptions, and above it prices are 5×.

The quadratic read term grows fastest with N, but at these sizes cache **writes** (1.25×) and output dominate. The biggest levers, in order:

1. Fewer turns (good tools and a good system prompt).
2. A smaller **d** (trimmed snapshots, screenshots on demand).
3. A cache that actually hits.
4. Effort.
5. Model.

Judge by cost per *verified Rule*, not per request [skill: shared/cost-optimization.md]. Rate limits for Opus 5.5 are a separate pool [skill: Opus 5.5 → What carries over].

## 7. What we build ourselves

1. **Tool implementations** over remote Playwright: a ref-annotated DOM snapshot with a character cap and scoping, query selector, click, a screenshot resized to ≤1280 px, cookies and storage reads, `try_rule` (run a candidate Rule in a fresh context and report the outcome), and `submit_rule`. Each handler converts failures to `ToolError`.
2. **Rule validator:** Zod mirroring autoconsent types, plus our protocol constraints (no `eval`). It is shared by `try_rule`, `submit_rule`, and the publish path.
3. **Job controller:** `max_iterations`, wall-clock `AbortSignal`, a token and dollar cap summed from `usage` (including `usage.iterations`), per-iteration `stop_reason` checks, and the submit sentinel.
4. **Transcript and usage persistence** (`runner.params` with `thread: false`), so admins can audit how a Rule was found and we can replay it.
5. **Backend interface:** tools defined once as Zod schemas plus handlers. An Anthropic adapter wraps them in `betaZodTool` and the runner, and a later Ollama adapter wraps the same definitions in its own loop. The runner's helpers stay behind the adapter.
6. **Prompt-injection posture:** page text is untrusted data that arrives in tool results. Tools have no effect outside the sandboxed browser, and the system prompt says to treat page content as data. (Anthropic runs injection classifiers on *its* browser toolset's results, not on custom tools [docs: browser-use-tool].)
7. **An eval set** (sites with known-good Rules) before tuning effort or model.

## Surprising findings that affect other tickets

- **Anthropic ships a browser toolset, `browser_toolset_20260801`.** It is GA on the Claude API and Google Cloud and **client-executed**: we host the browser, so it fits remote Playwright. It has 27 default members (`navigate`, `read_page` (accessibility tree with refs, ≤50K chars), `find`, `get_page_text`, `screenshot`, `left_click`, `form_input`, tabs, …) and 4 optional ones (`javascript_exec`, `read_console`, `read_network`, `file_upload`). It supports Opus 5.5, Sonnet 5.5, Haiku 5.5, and more. It adds about 6.6K tokens of overhead, can coexist with custom tools (dispatch on `toolset_name`), and Anthropic runs prompt-injection classifiers on its results [docs: browser-use-tool; docs: pricing]. This competes directly with our planned narrow browsing tools. The tradeoff is model quality and injection screening versus portability to Ollama and a smaller attack surface. Our Rule-specific tools (`try_rule`, `submit_rule`, cookies and storage) would stay custom either way.
- **Preserved thinking makes the history append-only.** A new API account (created on or after 2026-08-31) gets a 400 on any client-side edit of earlier turns. Any design that trims old snapshots or screenshots client-side breaks [skill: Opus 5.5 Breaking change 3].
- **Forced `tool_choice` is gone** on Opus 5.5 and Sonnet 5.5 (400), so "submit Rule" can only be steered by the prompt and checked [skill: Opus 5.5 Breaking change 2].
- **The autoconsent Rule schema can't be enforced by strict tools or structured outputs** (recursive, too many optional fields), so validation is ours. autoconsent's step type also includes `eval`, which our validator must reject [autoconsent `lib/rules.ts`; ADR-0002/0003].
- **The tool runner defaults to server-side message threads (beta)** and `max_iterations` defaults to no limit. Set `thread: false` and an explicit cap [sdk:helpers.md].

## Sources

claude-api skill (bundled, cached 2026-10-06): `SKILL.md`, `typescript/claude-api/{README,tool-use,streaming}.md`, `shared/{tool-use-concepts,agent-design,prompt-caching,error-codes,cost-optimization,model-migration,live-sources}.md`.

Official docs and SDK:

- TypeScript SDK helpers (Tool Runner, `betaZodTool`, `ToolError`, compaction, threads): <https://github.com/anthropics/anthropic-sdk-typescript/blob/main/helpers.md>
- Tool use overview: <https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview>
- Context editing: <https://platform.claude.com/docs/en/build-with-claude/context-editing>
- Compaction: <https://platform.claude.com/docs/en/build-with-claude/compaction>
- Preserved thinking: <https://platform.claude.com/docs/en/build-with-claude/preserved-thinking>
- Structured outputs: <https://platform.claude.com/docs/en/build-with-claude/structured-outputs>
- Prompt caching: <https://platform.claude.com/docs/en/build-with-claude/prompt-caching>
- Vision: <https://platform.claude.com/docs/en/build-with-claude/vision>
- Refusals and fallback: <https://platform.claude.com/docs/en/build-with-claude/refusals-and-fallback>
- Browser use tool: <https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool>
- Pricing: <https://platform.claude.com/docs/en/about-claude/pricing>
- Errors: <https://platform.claude.com/docs/en/api/errors>
- Effort: <https://platform.claude.com/docs/en/build-with-claude/effort>
- autoconsent rule types: <https://github.com/duckduckgo/autoconsent/blob/main/lib/rules.ts>
