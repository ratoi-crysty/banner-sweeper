import type { z } from 'zod';
import type { ContentBlock } from './content.js';

/**
 * A tool call that failed in a way the model can act on (a Rule that fails Validation, a stale ref, …).
 * The backend sends it back as an error result and the loop goes on.
 */
export interface ToolFailure {
  type: 'toolFailure';
  content: ContentBlock[];
}

export type ToolResult = ContentBlock[] | ToolFailure;

export interface ToolRunContext {
  /** The run's signal: aborted when the job times out or is deleted. */
  signal: AbortSignal;
}

/**
 * One entry of the backend-neutral tool registry. Names, descriptions and schemas are sent byte-identical
 * on every backend.
 */
export interface ToolDefinition<Input = unknown> {
  name: string;
  description: string;
  inputSchema: z.ZodType<Input>;
  readOnly: boolean;
  /** A successful call ends the run with a `terminal` outcome. A `ToolFailure` doesn't. */
  terminal: boolean;
  run(input: Input, context: ToolRunContext): Promise<ToolResult>;
}

export function toolFailure(content: string | ContentBlock[]): ToolFailure {
  return {
    type: 'toolFailure',
    content:
      typeof content === 'string' ? [{ type: 'text', text: content }] : content,
  };
}

export function isToolFailure(result: ToolResult): result is ToolFailure {
  return !Array.isArray(result);
}
