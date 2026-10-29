import type Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { BetaRunnableTool } from '@anthropic-ai/sdk/lib/tools/BetaRunnableTool';
import { ToolError } from '@anthropic-ai/sdk/lib/tools/ToolError';
import {
  isToolFailure,
  ToolDefinition,
  ToolResult,
} from '@banner-sweeper/llm-backend';
import { toBetaContent } from './content-blocks';

type BetaToolResultContentBlockParam =
  Anthropic.Beta.Messages.BetaToolResultContentBlockParam;

/**
 * Wraps the registry's tools for the Tool Runner, for one run.
 *
 * The runner starts every call of a turn at once, in the model's order. Each wrapped `run` waits for the call before
 * it, so the calls run one at a time, in order. Once a terminal tool succeeds, the turn's later calls don't run.
 */
export class SequentialTools {
  private succeededTerminal: string | null = null;

  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly signal: AbortSignal) {}

  /** The terminal tool whose call succeeded, once one has. */
  get terminalTool(): string | null {
    return this.succeededTerminal;
  }

  wrap(tool: ToolDefinition): BetaRunnableTool<unknown> {
    return betaZodTool({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      run: (input: unknown): Promise<BetaToolResultContentBlockParam[]> =>
        this.enqueue(tool, input),
    });
  }

  private enqueue(
    tool: ToolDefinition,
    input: unknown,
  ): Promise<BetaToolResultContentBlockParam[]> {
    const call: Promise<BetaToolResultContentBlockParam[]> = this.tail.then(
      (): Promise<BetaToolResultContentBlockParam[]> =>
        this.runOne(tool, input),
    );
    this.tail = call.catch((): void => undefined);
    return call;
  }

  /** A `ToolFailure` becomes a `ToolError`, which the runner sends back with `is_error: true`. */
  private async runOne(
    tool: ToolDefinition,
    input: unknown,
  ): Promise<BetaToolResultContentBlockParam[]> {
    if (this.terminalTool) {
      throw new ToolError(
        `Not run: ${this.terminalTool} already ended the run.`,
      );
    }
    if (this.signal.aborted) {
      throw new ToolError('Not run: the run was aborted.');
    }

    const result: ToolResult = await tool.run(input, { signal: this.signal });
    if (isToolFailure(result)) {
      throw new ToolError(result.content.map(toBetaContent));
    }
    if (tool.terminal) {
      this.succeededTerminal = tool.name;
    }
    return result.map(toBetaContent);
  }
}
