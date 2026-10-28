# Spike: the Tool Runner against Ollama's `/v1/messages`

Spike for [#19](https://github.com/ratoi-crysty/banner-sweeper/issues/19) (map #6). Run 2026-10-28.

**Setup:** `@anthropic-ai/sdk` **1.3.0** (`client.beta.messages.toolRunner` + `betaZodTool`, Zod 4.6.7), with `baseURL: http://localhost:11434`. Ollama **0.34.4** ran in Docker (`ollama/ollama:latest`, `--gpus=all`, `OLLAMA_CONTEXT_LENGTH=65536`; `/api/ps` confirms a 65,536-token context) on an 8 GB RTX 2070. The model was **`gemma4:e4b-it-qat`** (6.1 GB), the largest candidate with tools and vision that fits. Screenshots came from the remote browser (`mcr.microsoft.com/playwright:v1.64.1-noble`, `chromium.connect()`, 1280×800).

The question was about the **protocol**, not model quality. A 27B–35B model would go through the same wire path; how well it drives the browser is the map's "Model and effort choice" item.

## Answer in brief

1. **The Tool Runner works against Ollama only with `thread: false`.** The runner in SDK 1.x defaults to a server-side **message thread** (beta `message-threads-2026-08-12`):
   - Turn 1 sends `thread: {type: "create"}`.
   - Every later turn sends `thread: {type: "continue", previous_message_id}`. Its `messages` hold only the new messages, and `system` and `tools` are left out.
   - Ollama ignores the `thread` field and the beta header. So turn 2 reaches it as a lone `tool_result` with no system prompt, no tools and no history, and Ollama fails it with `400 "Failed to tokenize prompt"`. This happened 2 of 2 times (non-streaming and streaming).
   - The SDK's built-in fallback (`unsupportedRequestBehavior: 'continue_unthreaded'`) does not help. It only reacts to Anthropic's own `thread_unsupported_request` and `thread_not_found` error codes, and Ollama returns neither.
2. **With `thread: false`, the loop is clean:** the full history goes out on every turn, with no `anthropic-beta` header. 8 of 8 runs (5 non-streaming, 3 with `stream: true`) went `screenshot` → `finish` → `end_turn`, with no errors.
3. **Images inside `tool_result` reach the model.** `screenshot` returned only a base64 PNG `image` block. The page showed a random code word (for example `ORCHID-5999`) that exists only in the pixels. In all 8 runs the model reported the word: 6 exactly, and 2 with a hyphen or digit dropped (`SAFFRON268`, `LANTERN697`), which is the small model's OCR. A mixed `tool_result` (text plus image) also worked.
4. **Ollama silently ignores almost every Claude-only field rather than rejecting it.** This is the main risk: nothing errors, so anything we rely on must be checked by our own code. Rejected: URL image sources (400) and `POST /v1/messages/count_tokens` (404). The full table is below.
5. **`usage` is usable.** Ollama reports `input_tokens` (uncached) and `cache_read_input_tokens` (its own prompt cache), so the prompt size is the sum of the two. Repeating a 441-token prompt gave `5 + 436`. `cache_creation_input_tokens` is absent.
6. **Gemma 4 returned `thinking` blocks on every tool-calling turn**, without any `thinking` parameter. The runner passed them back unchanged, and Ollama accepted them.

## What the runner sends

From a logging `fetch` passed to the client (`results/runner-*.json`, field `wire`):

| | Default (threaded) | `thread: false` |
|---|---|---|
| `anthropic-beta` | `message-threads-2026-08-12` | none |
| `x-stainless-helper` | `BetaToolRunner, message-thread` | `BetaToolRunner` |
| Turn 1 body | `model, max_tokens, system, tools, messages[1], thread{create}` | `model, max_tokens, system, tools, messages[1]` |
| Turn 2+ body | `model, max_tokens, messages[1]` (the new `tool_result` only), `thread{continue}` | everything, `messages[3]`, `messages[5]`, … |
| Result on Ollama | 400 on turn 2 | works |

`stream: false` is sent explicitly in the body in both modes.

## Field probes

`probes.ts` sends one `client.beta.messages.create` per field (`results/probes-gemma4_e4b-it-qat.json`). "Ignored" means a 200 with no visible effect.

| Field | Result on Ollama |
|---|---|
| `thinking: {type: "adaptive"}` / `{type: "disabled"}` | accepted; no visible effect |
| `output_config.effort` | accepted, ignored |
| `output_config.format` (JSON schema) | **ignored**: returned prose ("Azure and 27."), not JSON |
| top-level `cache_control`; `cache_control` (with `ttl`) on a system block | accepted, ignored (Ollama caches prompts on its own) |
| `anthropic-beta` header, `thread`, `fallbacks: "default"`, `context_management` | accepted, ignored |
| `metadata`, `temperature`, `stop_sequences` | accepted (with `stop_sequences: ["5"]` the reply was only a `thinking` block with `stop_reason: end_turn`, never `stop_sequence`) |
| tool `strict: true`, `eager_input_streaming` | accepted; the tool call was valid |
| `tool_choice: auto` | works |
| `tool_choice: any` | **ignored**: answered in text without calling the tool |
| `tool_choice: none` | **ignored**: still called the tool |
| `disable_parallel_tool_use` | accepted (only one call either way, so its effect is untested) |
| `tool_result` with `is_error: true` | works: the model told the user the service was down |
| `tool_result` followed by a `text` block in the same user turn | works |
| `role: "system"` message mid-conversation | **honoured**: "Answer in German only" gave "Hallo" |
| image with `source.type: "url"` | **400** `invalid image source type: url. Only base64 images are supported.` |
| base64 PNG labelled `image/jpeg` | accepted and read correctly |
| `POST /v1/messages/count_tokens` | **404** |

## What this means for the backend interface ([#14](https://github.com/ratoi-crysty/banner-sweeper/issues/14))

- **One adapter over the Tool Runner is viable**, but a local backend must construct the runner with `thread: false`. Message threads are an Anthropic server feature that a backend-neutral interface cannot assume. Whether the Claude backend also turns threads off (one code path) or keeps them (fewer bytes per turn) is a #14 decision.
- **Our code has to enforce the contract.** Every Claude-only control is either ignored or a no-op locally: structured outputs, forced or suppressed `tool_choice`, `strict`, `cache_control`, `effort`, `fallbacks`. That matches the earlier plan: the Rule arrives as a `submit_rule` tool call, validated by `libs/rule-validation`, and the loop ends on `submit_rule`, `report_no_banner` or `end_turn`.
- **Ending the loop:** the runner itself ends on any reply without tool calls (`end_turn`). Detection still has to break out of the loop when `submit_rule` is called. Otherwise the runner returns the tool result and asks for one more reply, which every run here spent on a closing sentence.
- **Screenshots must be base64.** A URL source is rejected outright.
- **Token accounting** on a local backend is `input_tokens + cache_read_input_tokens`, and `count_tokens` is unavailable. A per-job cap or a screenshot-pruning threshold has to come from `usage` after each turn, not from a pre-count.

## Re-running

From this folder, with an Ollama server on `OLLAMA_BASE_URL` (default `http://localhost:11434`) and the remote browser on `PLAYWRIGHT_HOST` (or the repo's `.env.local`):

```bash
npm install
npx tsx runner.ts unthreaded            # or: threaded | unthreaded stream | threaded stream
npx tsx probes.ts
SPIKE_MODEL=qwen3.6:27b npx tsx runner.ts unthreaded   # a 24 GB machine
```

Each run writes `results/<kind>-<model>-<time>.json` (turns, `finish` input, the code word, and the wire log).
