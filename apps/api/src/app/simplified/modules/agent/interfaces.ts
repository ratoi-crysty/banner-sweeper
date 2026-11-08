/**
 * BE-only contracts for model providers. (Not in types/: the FE never implements these.)
 */
import type { AgentResult, ToolCall, ToolDefinition, ToolResult } from './types';

/** Everything a provider gets for one run. Tool execution and step tracking live here, not in providers. */
export interface AgentSession {
  readonly task: string;
  readonly system: string;
  readonly tools: ToolDefinition[];
  /** Max model turns. */
  readonly maxSteps: number;
  readonly signal?: AbortSignal;
  /** Runs a tool call against the page and records it as a step. Never throws: failures come back as `isError` results. */
  execute(call: ToolCall): Promise<ToolResult>;
  /** Set once the agent called `done`; providers should stop then. */
  readonly finished: AgentResult | undefined;
}

/** How a provider's loop ended. */
export interface AgentLoopOutcome {
  /** Why it stopped (last model text, turn limit, …). Becomes the run's summary when the agent never called `done`. */
  stopReason: string;
}

/**
 * The one interface every model backend implements. `AgentProviderFactory` builds each provider with
 * whatever it needs (API keys, hosts, SDK options); `AgentService` only ever calls `run`.
 */
export interface AgentProvider {
  /** For logs. */
  readonly name: string;
  /** Whether the model sees screenshots (`ToolResult.imageBase64`). Without it, screenshot tools are pointless. */
  readonly vision: boolean;
  /** Drive the agent until it calls `done`, runs out of turns, or `session.signal` aborts. */
  run(session: AgentSession): Promise<AgentLoopOutcome>;
}
