import type { ContentBlock } from './content.js';
import type { ToolDefinition, ToolResult } from './tool.js';
import type { Pricing, TokenUsage } from './usage.js';

export interface RunSession {
  system: string;
  firstMessage: ContentBlock[];
  tools: ToolDefinition[];
  maxTurns: number;
  signal: AbortSignal;
}

export interface ToolCall {
  name: string;
  input: unknown;
  result: ToolResult;
}

/** One model reply and the tool calls it made, yielded once those calls have run. Thinking never appears here. */
export interface TurnEvent {
  /** 1-based. */
  turn: number;
  assistantText: string;
  toolCalls: ToolCall[];
  usage: TokenUsage;
}

export interface TerminalOutcome {
  kind: 'terminal';
  /** The terminal tool whose call succeeded. */
  tool: string;
}

export interface EndTurnOutcome {
  kind: 'endTurn';
}

export interface MaxTurnsOutcome {
  kind: 'maxTurns';
}

export interface AbortedOutcome {
  kind: 'aborted';
}

export interface RefusedOutcome {
  kind: 'refused';
}

export interface FailedOutcome {
  kind: 'failed';
  message: string;
}

export type RunOutcome =
  | TerminalOutcome
  | EndTurnOutcome
  | MaxTurnsOutcome
  | AbortedOutcome
  | RefusedOutcome
  | FailedOutcome;

/** What a job's `usage` says about the backend that ran it, and what its tokens cost. */
export interface BackendDescription {
  /** The config entry's id. */
  backend: string;
  model: string;
  effort: string | null;
  pricing: Pricing | null;
}

/** The seam between Detection and an LLM: the backend owns the whole agent loop (ADR-0009). */
export interface DetectionBackend {
  readonly description: BackendDescription;
  run(session: RunSession): AsyncGenerator<TurnEvent, RunOutcome, undefined>;
}
