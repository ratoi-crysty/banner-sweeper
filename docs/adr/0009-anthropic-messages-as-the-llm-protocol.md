---
status: accepted
---

# Every LLM backend speaks the Anthropic Messages API, and the backend owns the agent loop

Detection talks to an LLM through one interface, `DetectionBackend.run(session)`, which owns the whole agent loop: Detection hands it the system prompt, the first user message, the tool registry, a turn cap and an abort signal, and gets back per-turn events and a final outcome. Both v1 backends speak Anthropic's `/v1/messages` through the Anthropic SDK's Tool Runner: Claude itself, and local servers (Ollama, LM Studio, llama.cpp, vLLM) that serve the same route. A spike showed the Tool Runner runs unchanged against Ollama with `thread: false`. Claude and local models need opposite things from the history (Claude rejects edits to earlier turns, small local contexts need old screenshots pruned), so context management has to sit inside the backend, and so does the loop.

## Considered Options

- **A single-turn seam, with Detection owning the loop and the transcript.** Rejected: it gives up the Tool Runner, and Claude's signed thinking blocks would have to cross the seam as opaque provider data.
- **OpenAI Chat Completions as the shared protocol.** Rejected: it doesn't allow images in tool results, and screenshots are the agent's main input. Every local server we'd use already serves the Anthropic route.

## Consequences

- An abstract `AnthropicMessagesBackend` holds the loop. `ClaudeBackend` adds effort, adaptive thinking, server-side fallbacks and cache breakpoints, and leaves history alone; `AnthropicCompatibleBackend` sends none of those fields (Ollama silently ignores them) and replaces all but the last few screenshots with a placeholder.
- Anything we rely on must be enforced by our own code, never by request fields: tool-call submission, Validation, and the end of the loop on a terminal tool.
- A backend that only speaks another protocol implements `DetectionBackend` directly and owns its own loop.
