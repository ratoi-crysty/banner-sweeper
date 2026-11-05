# llm-backend

The neutral types on the seam between Detection and an LLM (ADR-0009). Detection, the tool registry and the test-set runner import them; the backends that implement `DetectionBackend` live in `apps/api`'s `LlmBackendModule`.

- `DetectionBackend.run({ system, firstMessage, tools, maxTurns, signal })` runs the whole agent loop. It yields a `TurnEvent` after each turn's tools have run and returns a `RunOutcome`: `terminal { tool } | endTurn | maxTurns | aborted | refused | failed { message }`. Thinking never crosses the seam.
- `ToolDefinition`: one entry of the tool registry, `{ name, description, inputSchema (Zod), readOnly, terminal, run }`. `run` returns `ContentBlock[]` (text, base64 images) or a `ToolFailure`, which goes back to the model as an error result.
- `costUsd(usage, pricing)`: a job's cost from the backend's `pricing`, or `null` without one.

Its only dependency is `zod` (for `inputSchema`), pinned in the root `package.json`.

## Running unit tests

Run `npx nx test @banner-sweeper/llm-backend` to execute the unit tests via [Vitest](https://vitest.dev/).
