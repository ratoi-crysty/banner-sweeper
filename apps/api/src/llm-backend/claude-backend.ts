import type { BetaRunnableTool } from '@anthropic-ai/sdk/lib/tools/BetaRunnableTool';
import type { BetaToolRunnerParams } from '@anthropic-ai/sdk/lib/tools/BetaToolRunner';
import {
  AnthropicMessagesBackend,
  BaseRequest,
} from './anthropic-messages-backend';

const SERVER_SIDE_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

const EPHEMERAL = { type: 'ephemeral' } as const;

/**
 * Claude itself: effort, adaptive thinking, server-side fallbacks on a refusal, and cache breakpoints on `system`,
 * `tools` and the history. It leaves the history alone, since Claude rejects edits to earlier turns.
 */
export class ClaudeBackend extends AnthropicMessagesBackend {
  protected requestParams(request: BaseRequest): BetaToolRunnerParams {
    const lastTool: number = request.tools.length - 1;

    return {
      ...request,
      system: [
        { type: 'text', text: request.system, cache_control: EPHEMERAL },
      ],
      tools: request.tools.map(
        (
          tool: BetaRunnableTool<unknown>,
          index: number,
        ): BetaRunnableTool<unknown> =>
          index === lastTool ? { ...tool, cache_control: EPHEMERAL } : tool,
      ),
      // Automatic caching: a breakpoint on the end of the history, so each turn reads the turns before it from cache.
      cache_control: EPHEMERAL,
      thinking: { type: 'adaptive' },
      ...(this.entry.effort && {
        output_config: { effort: this.entry.effort },
      }),
      betas: [SERVER_SIDE_FALLBACK_BETA],
      fallbacks: 'default',
    };
  }
}
