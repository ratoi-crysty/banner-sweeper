import type { Page } from 'playwright-core';
import type { Action } from './actions/browser-actions';
import type { AgentResult, AgentSession, AgentStep, ToolCall, ToolDefinition, ToolResult } from './types/agent.types';

export interface BrowserAgentSessionInit {
  task: string;
  system: string;
  maxSteps: number;
  signal?: AbortSignal;
  actions: Record<string, Action>;
  /** Called per tool call, so the page can be swapped mid-run. */
  page: () => Page;
  /** Per-action timeout, ms. */
  timeout: number;
  onStep?: (step: AgentStep) => void;
}

/** The single place where tool calls hit Playwright, whichever provider drives them. */
export class BrowserAgentSession implements AgentSession {
  readonly task: string;
  readonly system: string;
  readonly maxSteps: number;
  readonly signal?: AbortSignal;
  readonly tools: ToolDefinition[];
  readonly steps: AgentStep[] = [];
  private done: AgentResult | undefined;

  constructor(private readonly init: BrowserAgentSessionInit) {
    this.task = init.task;
    this.system = init.system;
    this.maxSteps = init.maxSteps;
    this.signal = init.signal;
    this.tools = Object.values(init.actions).map((action: Action): ToolDefinition => action.definition);
  }

  get finished(): AgentResult | undefined {
    return this.done;
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    if (this.signal?.aborted) return { text: 'Run cancelled.', isError: true };
    const action: Action | undefined = this.init.actions[call.name];
    let result: ToolResult;
    try {
      result = action
        ? await action.run({ page: this.init.page(), timeout: this.init.timeout }, call.args ?? {})
        : { text: `Unknown action "${call.name}".`, isError: true };
    } catch (err) {
      result = { text: (err as Error).message.split('\n')[0] ?? '', isError: true };
    }
    const step: AgentStep = { call, result };
    this.steps.push(step);
    this.init.onStep?.(step);
    if (call.name === 'done') {
      this.done = { success: Boolean(call.args['success']), summary: String(call.args['summary'] ?? ''), steps: this.steps };
    }
    return result;
  }

  /** The run's result after the provider stopped: `done` wins, then cancellation, then the provider's stop reason. */
  result(stopReason: string): AgentResult {
    if (this.done) return this.done;
    if (this.signal?.aborted) return { success: false, summary: 'Cancelled.', steps: this.steps, cancelled: true };
    return { success: false, summary: stopReason || 'Stopped without calling done.', steps: this.steps };
  }
}
