# Local model backends for Detection

Research for [#10](https://github.com/ratoi-crysty/banner-sweeper/issues/10) (part of map #6). Gathered 2026-10-26. This area changes monthly, so re-check versions before building on it.

**Question:** Can local models drive the browser well enough to be a Detection backend, and through which API?

## Answer in brief

1. **All four servers now accept the Anthropic Messages API (`POST /v1/messages`) as well as OpenAI Chat Completions.** Ollama added it in v0.14.0 (Jan 2026), LM Studio in 0.4.1 (Jan 2026), llama.cpp `llama-server` around Jan 2026, and vLLM in v0.11.1 (Nov 2025). So the Claude adapter's wire format reaches every local server, and a local backend can be "the Anthropic adapter with a different `baseURL`".
2. **Screenshots inside `tool_result` work on the Anthropic route of Ollama, llama.cpp and vLLM**, according to their converter source. The OpenAI Chat Completions spec does *not* allow images in `role: "tool"` messages. That makes the Anthropic content-block shape the better choice for the shared shape.
3. **No local server should be assumed to honour `tool_choice`.** Ollama ignores it on both its Anthropic and OpenAI routes. Claude Opus 5.5 and Sonnet 5.5 also reject forced `tool_choice` (`any` or `tool`). The loop must therefore end on "the model called `submit_rule`" or "no tool calls", never on a forced tool.
4. **Models:** the strongest local candidates with tool calling plus vision in one model are **Qwen3.5/3.6 (27B dense, 35B-A3B MoE)** and **Gemma 4 (26B-A4B, 31B)**. Their vendor-reported agent scores (OSWorld-Verified around 55, ScreenSpot Pro around 70, BFCL-V4 around 68, τ2 around 77 to 81) are close to frontier models from 2025. No independent browser benchmark of these models exists yet. The independent numbers we have, for older and smaller open models, are much worse (Online-Mind2Web 25 to 35% against 58% for GPT-5-based agents).
5. **Hardware:** the usable floor is a 24 GB GPU (or a 32 GB-plus Apple Silicon machine) running a 27B to 35B model at 4-bit (17 to 24 GB of weights), **with the context raised to at least 64k**. Ollama defaults to 4k context below 24 GiB of VRAM and 32k at 24 to 48 GiB, which would silently truncate a multi-turn session full of screenshots.
6. **Verdict:** local models are a plausible *second* backend, not a replacement. Treat it as unproven until we measure it on our test set. Our task is narrower than the general web-agent benchmarks (one Site, one banner, CSS selectors, and a Verification step that grades the output), which helps.

---

## 1. What each server exposes

### Summary table

| | Ollama | LM Studio | llama.cpp `llama-server` | vLLM |
|---|---|---|---|---|
| Anthropic `/v1/messages` | Yes, since **v0.14.0** (released about 2026-01-14) | Yes, since **0.4.1** (2026-01-30) | Yes (announced 2026-01-19, PR #17570) | Yes, since **v0.11.1** (2025-11-18) |
| `/v1/messages/count_tokens` | No | Not documented | Yes | Yes |
| OpenAI `/v1/chat/completions` | Yes (tools, vision) | Yes (text and images) | Yes (`--jinja` for tools) | Yes |
| OpenAI `/v1/responses` | Yes, stateless only (since v0.13.3) | Yes (since 0.3.29) | Not checked | Yes |
| Tools (Anthropic route) | Yes | Yes ("function calling works out of the box") | Yes | Yes |
| `tool_choice` | **Not supported** (either route) | Shown in docs example (`any`) | Converted to OpenAI `auto`/`required` | Yes: `any` becomes `required`, named tool works through structured outputs |
| Image input | Base64 only, **no URL images** | Chat Completions: yes. `/v1/messages`: **not documented** | Base64 and URL (needs a multimodal model and mmproj) | Base64 and URL |
| Image inside `tool_result` | **Yes** (attached as images on the tool message) | Unknown | **Yes** (forwarded as OpenAI image parts on the tool message) | **Yes**, but moved into a separate user message after the tool message |
| Streaming | Yes (SSE, including `input_json_delta`) | Yes (SSE) | Yes (SSE) | Yes |
| Thinking | Basic (`budget_tokens` accepted, not enforced) | Not documented | Yes (`thinking` parameter) | Yes (budget mapped to `thinking_token_budget`) |
| Prompt caching, batches | No | No | No | No |

### Ollama

- Anthropic compatibility: `http://localhost:11434/v1/messages`. Supported: messages, streaming, system (string or array), multi-turn, vision, tools, tool results, thinking. **Not supported:** `tool_choice`, `metadata`, `count_tokens`, prompt caching, batches, citations, PDF blocks. "Base64 images supported; URL images not supported." Token counts are approximate. [docs.ollama.com/api/anthropic-compatibility](https://docs.ollama.com/api/anthropic-compatibility)
- The converter accepts `tool_result.content` as a string or an array of blocks, decodes `image` blocks inside it, and attaches them as `Images` on the resulting `role: tool` message. Source: `convertToolResultContent` in [ollama/anthropic/anthropic.go](https://github.com/ollama/ollama/blob/main/anthropic/anthropic.go) (read on main, 2026-10-26).
- Introduced in v0.14.0. The Ollama blog of 2026-01-16 says "v0.14.0 and later" work with Claude Code via `ANTHROPIC_BASE_URL=http://localhost:11434`. [ollama.com/blog/claude](https://registry.ollama.ai/blog/claude). Third-party guides report that v0.14.3 or later is needed for stable *streaming* tool calls. Unverified.
- OpenAI compatibility: Chat Completions supports tools (not `tool_choice`) and vision with base64 only. Responses is stateless only. "The OpenAI API does not have a way of setting the context size." You need a Modelfile or a server setting. [docs.ollama.com/api/openai-compatibility](https://docs.ollama.com/api/openai-compatibility)
- Native `/api/chat`: tool calls come back as `message.tool_calls`. Results go back as `role: "tool"` with `tool_name`. Parallel calls arrive as several entries. [docs.ollama.com/capabilities/tool-calling](https://docs.ollama.com/capabilities/tool-calling)
- **Context length trap:** the default depends on VRAM: under 24 GiB gives 4k, 24 to 48 GiB gives 32k, and 48 GiB or more gives 256k. The docs say agents "should be set to at least 64000 tokens" (`OLLAMA_CONTEXT_LENGTH`). [docs.ollama.com/context-length](https://docs.ollama.com/context-length)

### LM Studio

- `POST /v1/messages` arrived in **0.4.1**. The blog says "Tool use: Function calling works out of the box" and lists SSE streaming. It does not mention images or thinking. [lmstudio.ai/blog/claudecode](https://lmstudio.ai/blog/claudecode) (2026-01-30), [API changelog](https://lmstudio.ai/docs/developer/api-changelog), [Messages docs](https://lmstudio.ai/docs/developer/anthropic-compat/messages) (examples show `tools` and `tool_choice: {type: "any"}`; no image or `tool_result` examples).
- OpenAI-compatible: `/v1/chat/completions` ("text and images") and `/v1/responses` (0.3.29, 2025-10-06). `tool_choice` has been supported on the OpenAI-like API since 0.3.15. [lmstudio.ai/docs/developer/openai-compat](https://lmstudio.ai/docs/developer/openai-compat)
- **Gap:** whether images, especially inside `tool_result`, survive the `/v1/messages` route is undocumented. A spike has to confirm it before LM Studio counts as supported over the Anthropic route.

### llama.cpp (`llama-server`)

- Anthropic Messages API: `POST /v1/messages` and `/v1/messages/count_tokens`. Supports tool use through `tool_use`/`tool_result`, "Image inputs via base64 or URL (requires multimodal model)", and extended thinking. It converts internally to the OpenAI format. [HF blog, 2026-01-19](https://huggingface.co/blog/ggml-org/anthropic-messages-api-in-llamacpp), [PR #17570](https://github.com/ggml-org/llama.cpp/pull/17570)
- Images in `tool_result` become OpenAI `image_url` parts on the `role: tool` message (comment in source: "Mixed or image-only: use array content parts (OpenAI multimodal tool format)"). `tool_choice` maps to `auto`/`required`. [tools/server/server-chat.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server-chat.cpp). Whether the *chat template* then shows the image to the model depends on the model's template. Unverified per model.
- Tool calling needs `--jinja` and a tool-aware chat template. Without a native handler it falls back to a "Generic" format that "may consume more tokens and be less efficient". Parallel tool calls are off by default. **Warning: "extreme KV cache quantization (e.g. `-ctk q4_0`) can substantially degrade the model's tool calling performance."** [docs/function-calling.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/function-calling.md)

### vLLM

- Endpoints include OpenAI (`/v1/chat/completions`, `/v1/responses`) and **Anthropic (`/v1/messages`, `/v1/messages/count_tokens`)**. [docs.vllm.ai online serving](https://docs.vllm.ai/en/latest/serving/online_serving/). Added in v0.11.1: "Anthropic API Support: Added support for the `/v1/messages` endpoint" ([release notes](https://github.com/vllm-project/vllm/releases/tag/v0.11.1), 2025-11-18).
- Converter ([`vllm/entrypoints/anthropic/serving.py`](https://docs.vllm.ai/en/stable/api/vllm/entrypoints/anthropic/serving/)): image blocks accept both base64 (turned into a data URI) and URL. In `tool_result`, text becomes the `role: tool` message and **images are sent in a separate user message**. `tool_choice` maps `any` to `required` and `tool` to a named function. `disable_parallel_tool_use` maps to `parallel_tool_calls: false`. Thinking budget maps to `thinking_token_budget`.
- Tool calling needs `--enable-auto-tool-choice --tool-call-parser <name>` (Qwen3.5/3.6 use `qwen3_coder`; Gemma and GLM have their own parsers). `required` and named `tool_choice` are enforced through structured outputs. `auto` "makes no guarantee", and malformed tool markup can leak into text. [docs.vllm.ai tool calling](https://docs.vllm.ai/en/latest/features/tool_calling/)
- vLLM is a GPU-server deployment (the model cards' examples use 8-way tensor parallelism), not a laptop tool.

### The Anthropic side, for comparison

- `tool_result` content can be text or image blocks. The Tool Runner (`client.beta.messages.toolRunner`) is a client-side loop that posts to `/v1/messages` (the TS SDK's beta `create` posts to `/v1/messages`; see [anthropic-sdk-typescript `resources/beta/messages/messages.ts`](https://github.com/anthropics/anthropic-sdk-typescript/blob/main/src/resources/beta/messages/messages.ts)). Pointing the SDK at a local `baseURL` should therefore work at the wire level. The runner may still send beta-only fields (compaction, `anthropic-beta` headers) that local servers ignore or reject. **Untested; this needs a spike.**
- **Forced tool use:** "Claude Opus 5.5, Claude Sonnet 5.5, Claude Fable 5.1, and Claude Mythos 5.1: `any` and `tool` return a 400 error." Use `auto` with `strict: true` tools instead. [platform.claude.com define-tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools)
- OpenAI Chat Completions, by contrast: `ChatCompletionToolMessageParam.content` is `string | Array<ChatCompletionContentPartText>`, so text only. [openai-node `completions.ts`](https://github.com/openai/openai-node/blob/master/src/resources/chat/completions/completions.ts)

## 2. Which local models can do it, and at what cost

### Evidence quality

There is **no independent, current benchmark** of local models doing multi-turn tool calling *with screenshots in a browser*. What exists:

- **Vendor model cards**, which are recent and cover the right capabilities but are self-reported.
- **The official BFCL leaderboard**, which is independent and covers multi-turn function calling but no vision. It was last updated 2026-04-12 and does not include Qwen3.5/3.6 or Gemma 4.
- **Web-agent papers**, which are independent and use live sites, but test older or specialised models.

### Current candidates (vendor-reported, from the model cards)

| Model (open weights) | Released | Shape | Vision + tools | Agent scores (self-reported) | Ollama Q4 download |
|---|---|---|---|---|---|
| **Qwen3.5-27B** | 2026-02 | dense 27B, 262k ctx | yes / yes | BFCL-V4 68.5, τ2 79.0, OSWorld-Verified 56.2, ScreenSpot Pro 70.3, BrowseComp 61.0 | ~17 GB |
| **Qwen3.5-35B-A3B** | 2026-02 | MoE 35B / 3B active | yes / yes | BFCL-V4 67.3, τ2 81.2, OSWorld-Verified 54.5, ScreenSpot Pro 68.6, AndroidWorld 71.1 | ~22 to 24 GB |
| **Qwen3.6-35B-A3B** (and 27B) | 2026-04 | MoE 35B / 3B active | yes / yes | Vendor says it beats Qwen3.5-35B-A3B. Reports TAU3 67.2, MCP-Atlas 62.8, MCPMark 37.0. Recommends `preserve_thinking` for agents | ~24 GB (27B ~17 GB) |
| **Gemma 4 31B** | 2026 (tech report 2026-07) | dense 31B, 256k ctx | yes / yes (native function calling) | τ2 avg 76.9 | ~20 GB |
| **Gemma 4 26B-A4B** | 2026 | MoE 25B / 3.8B active | yes / yes | τ2 avg 68.2 | ~18 GB |
| Gemma 4 12B / E4B | 2026 | dense | yes / yes | τ2 avg 69.0 / 42.2 | ~8 GB / ~7 GB |

Sources: [Qwen3.5-27B card](https://huggingface.co/Qwen/Qwen3.5-27B), [Qwen3.5-35B-A3B card](https://huggingface.co/Qwen/Qwen3.5-35B-A3B), [Qwen3.6-35B-A3B card](https://huggingface.co/Qwen/Qwen3.6-35B-A3B), [Gemma 4 31B card](https://huggingface.co/google/gemma-4-31B-it), Ollama tags for [qwen3.5](https://ollama.com/library/qwen3.5/tags), [qwen3.6](https://ollama.com/library/qwen3.6/tags) and [gemma4](https://ollama.com/library/gemma4/tags).

For scale on OSWorld and ScreenSpot: these are computer-use benchmarks, which are harder than our task because we navigate the page with DOM and CSS selectors, not pixel coordinates.

### Independent numbers (older or specialised models)

- **BFCL official leaderboard** ([gorilla.cs.berkeley.edu/leaderboard.html](https://gorilla.cs.berkeley.edu/leaderboard.html), data `data_overall.csv`, last updated 2026-04-12), multi-turn accuracy:
  - Claude Opus 4.5 (FC): 68.4% (overall 77.5%)
  - GLM-4.6 (FC thinking, MIT, 355B MoE, not laptop-class): 68.0% (overall 72.4%)
  - Qwen3-32B (FC): 47.9%
  - Qwen3-235B-A22B-2507 (FC): 45.4%
  - Qwen3-8B (FC): 41.8%
  - Qwen3-30B-A3B-2507 (FC): 30.0%
  - Gemma-3-27B (prompt): 10.8%
  - Llama-3.3-70B: 21.5%
  - The previous open-weight generation was clearly weaker at multi-turn tool use, even at 30B. Small models (4B and under) are not viable.
- **Online-Mind2Web** (live sites, judged by LLM):
  - MolmoWeb-8B: 35.3% single attempt, 60.5% with 4 attempts. GPT-5 set-of-marks agent: 57.7%. ([Ai2 blog, 2026-03-24](https://allenai.org/blog/molmoweb)). MolmoWeb is a specialised screenshot-to-coordinates policy, not a general tool caller, so it cannot emit our JSON Rule. It does not fit as a backend.
  - Qwen3-VL-8B as the action model: 25.7% ([Avenir-Web, arXiv 2602.02468](https://arxiv.org/abs/2602.02468)).
  - A small multimodal model goes from 25.66% to 33.33% after fine-tuning ([BrowserForge, arXiv 2608.24848](https://arxiv.org/abs/2608.24848), 2026-08-25).
- Browser Use's BU Bench publishes only hosted models, so it does not help here ([browser-use.com](https://browser-use.com/posts/ai-browser-agent-benchmark)).

### Hardware tiers (Ollama download sizes; add KV cache for 64k or more context)

| Tier | Example hardware | Viable models | Notes |
|---|---|---|---|
| Not viable | 8 to 12 GB GPU | Qwen3.5-9B, Gemma 4 E4B/12B | Context gets cut to 4k by default. Multi-turn tool use is weak at this size (BFCL multi-turn below 45% for previous-generation 8B models). |
| Minimum | 24 GB GPU (RTX 3090/4090) or 32 to 36 GB Mac | Qwen3.5/3.6-27B Q4 (17 GB), Gemma 4 26B-A4B (18 GB) | Leaves about 5 to 7 GB for KV cache. Set the context to 64k explicitly. Do not quantise the KV cache aggressively (it hurts tool calling, per the llama.cpp docs). |
| Comfortable | 48 GB-plus GPU (or 2x24) or 64 GB-plus Mac | Qwen3.6-35B-A3B Q4/Q8 (24 to 39 GB), Gemma 4 31B Q8 (34 GB) | The MoE A3B variants run at roughly 3B-model speed, which matters over many turns. |
| Server | Multi-GPU and vLLM | BF16 weights (56 to 72 GB) or larger MoE (Qwen3.5-122B-A10B, 81 GB at Q4) | Gets structured-output-enforced `tool_choice`. |

Screenshots are the main context cost. Each image costs on the order of a thousand tokens at 1280x720 for Qwen-VL-style encoders (estimate, not measured). Keep only the latest one or two screenshots in history, or downscale them.

## 3. A shared shape for Claude and local models

**Recommendation: make the Anthropic Messages content-block model the canonical internal shape, defined as our own TS interfaces rather than SDK types, and target `/v1/messages` on every backend first.** It is the one format that:

- every listed server now accepts natively,
- carries images inside `tool_result`, which OpenAI Chat Completions forbids,
- the first (Claude) backend uses unchanged.

The minimal shape that all servers support today:

| Element | Shape | Constraints learnt above |
|---|---|---|
| System | single string | Ollama, llama.cpp and vLLM also accept arrays, but a string is safest |
| Messages | `{role: 'user' \| 'assistant', content: Block[]}` | Strictly alternating. All `tool_result`s for one assistant turn go in the next user message |
| Blocks | `text`, `image` (base64 PNG/JPEG, **no URL source**, because Ollama rejects URLs), `tool_use {id, name, input}`, `tool_result {tool_use_id, content: (text \| image)[], is_error?}` | Thinking blocks are optional and backend-specific. Pass them through opaquely or drop them |
| Tools | `{name, description, input_schema: JSONSchema}` | Keep schemas simple (flat objects, enums). `strict` is Claude-only |
| Tool choice | **always `auto` (omit)** | Ollama ignores it, and Claude Opus/Sonnet 5.5 reject `any`/`tool` |
| Stop | `end_turn` \| `tool_use` \| `max_tokens` | Ollama documents all three. llama.cpp and vLLM map them from OpenAI `finish_reason` |
| Usage | `input_tokens`, `output_tokens` | Approximate on Ollama. No cache fields locally |

Consequences for the design (inputs to #14):

- **End the loop on a `submit_rule` tool call (or `end_turn`), not on forced tool use.** If a local model stops without calling it, a backend-agnostic fallback is one more turn asking for the JSON. Native constrained decoding (Ollama `format`, vLLM structured outputs, llama.cpp grammars) is backend-specific and lives in that backend.
- **Owning the loop matters.** The Tool Runner owns the loop on the Anthropic side. A local backend over `/v1/messages` could reuse the same SDK and Tool Runner with a different `baseURL`, which would mean one adapter for everything. The alternative is a seam at the single-turn level (`complete(request): AssistantTurn`) with our own small loop, which avoids depending on Tool Runner beta behaviour against non-Anthropic servers. A spike against Ollama decides which: run the Tool Runner with `baseURL=http://localhost:11434` and a screenshot `tool_result`.
- **An OpenAI Chat Completions adapter is the fallback**, needed only for servers or models whose Anthropic route is missing or broken (for example, if LM Studio's `/v1/messages` drops images). It must move screenshots from the tool message into a follow-up user message, as vLLM does internally.
- **Configuration per backend:** `baseURL`, `model`, `apiKey` (ignored locally), `maxContextTokens` (to prune screenshots), `supportsImagesInToolResult`, and `supportsToolChoice`. Ollama's context length is a server-side setting the adapter cannot change over `/v1/messages`.

## Open questions and suggested spikes

1. Run the Tool Runner (TS SDK) against Ollama `/v1/messages` with `qwen3.6:27b` and a base64 screenshot in `tool_result`: does it complete a multi-turn loop, and does the model actually see the image?
2. LM Studio `/v1/messages`: are image blocks (top-level and in `tool_result`) passed to VLMs?
3. Measure the test set on a 24 GB GPU: Qwen3.6-27B and Gemma 4 26B-A4B against Claude, for Verification pass rate, turns and wall-clock time. This is the only evidence that will settle "well enough".

## Sources

- Ollama: [Anthropic compatibility](https://docs.ollama.com/api/anthropic-compatibility), [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility), [tool calling](https://docs.ollama.com/capabilities/tool-calling), [context length](https://docs.ollama.com/context-length), [Claude Code blog (2026-01-16)](https://registry.ollama.ai/blog/claude), [anthropic.go source](https://github.com/ollama/ollama/blob/main/anthropic/anthropic.go)
- LM Studio: [Anthropic compat](https://lmstudio.ai/docs/developer/anthropic-compat), [Messages](https://lmstudio.ai/docs/developer/anthropic-compat/messages), [OpenAI compat](https://lmstudio.ai/docs/developer/openai-compat), [API changelog](https://lmstudio.ai/docs/developer/api-changelog), [0.4.1 blog](https://lmstudio.ai/blog/claudecode)
- llama.cpp: [HF blog: Anthropic Messages API](https://huggingface.co/blog/ggml-org/anthropic-messages-api-in-llamacpp), [PR #17570](https://github.com/ggml-org/llama.cpp/pull/17570), [server-chat.cpp](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/server-chat.cpp), [function-calling.md](https://github.com/ggml-org/llama.cpp/blob/master/docs/function-calling.md)
- vLLM: [online serving endpoints](https://docs.vllm.ai/en/latest/serving/online_serving/), [Anthropic serving source](https://docs.vllm.ai/en/stable/api/vllm/entrypoints/anthropic/serving/), [tool calling](https://docs.vllm.ai/en/latest/features/tool_calling/), [v0.11.1 release](https://github.com/vllm-project/vllm/releases/tag/v0.11.1)
- Anthropic: [define tools / tool_choice](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools), [Tool Runner](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-runner), [TS SDK source](https://github.com/anthropics/anthropic-sdk-typescript)
- OpenAI: [openai-node chat completions types](https://github.com/openai/openai-node/blob/master/src/resources/chat/completions/completions.ts)
- Models: [Qwen3.5-27B](https://huggingface.co/Qwen/Qwen3.5-27B), [Qwen3.5-35B-A3B](https://huggingface.co/Qwen/Qwen3.5-35B-A3B), [Qwen3.6-35B-A3B](https://huggingface.co/Qwen/Qwen3.6-35B-A3B), [Gemma 4 31B](https://huggingface.co/google/gemma-4-31B-it), Ollama library tags ([qwen3.5](https://ollama.com/library/qwen3.5/tags), [qwen3.6](https://ollama.com/library/qwen3.6/tags), [gemma4](https://ollama.com/library/gemma4/tags))
- Benchmarks: [BFCL leaderboard](https://gorilla.cs.berkeley.edu/leaderboard.html) (updated 2026-04-12), [MolmoWeb](https://allenai.org/blog/molmoweb), [Avenir-Web](https://arxiv.org/abs/2602.02468), [BrowserForge](https://arxiv.org/abs/2608.24848), [Online-Mind2Web paper](https://arxiv.org/abs/2504.01382), [BU Bench](https://browser-use.com/posts/ai-browser-agent-benchmark)
