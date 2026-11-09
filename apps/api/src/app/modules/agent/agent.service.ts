import { Injectable } from '@nestjs/common';
import type { Page } from 'playwright-core';
import { browserActions, type Action } from './actions/browser-actions';
import { AgentProviderFactory } from './agent-provider.factory';
import { BrowserAgentSession } from './agent-session';
import type { AgentLoopOutcome, AgentProvider, AgentResult, AgentStep, ProviderConfig } from './types/agent.types';

export interface AgentRunOptions {
  /** The page to act on, or a getter if the page can be swapped mid-run (e.g. a reset action). */
  page: Page | (() => Page);
  system: string;
  /** A ProviderConfig (built by AgentProviderFactory), a ready provider, or nothing for the module default. */
  provider?: ProviderConfig | AgentProvider;
  /** Restrict or extend the instruction set. Default: all browser actions. */
  actions?: Record<string, Action>;
  maxSteps?: number;
  /** Per-action timeout, ms. Default 5000. */
  timeout?: number;
  onStep?: (step: AgentStep) => void;
  /** Abort the run (e.g. a cancelled job). */
  signal?: AbortSignal;
}

/** Runs an LLM agent against a Playwright page with a fixed instruction set, through any AgentProvider. */
@Injectable()
export class AgentService {
  constructor(private readonly providers: AgentProviderFactory) {}

  async run(task: string, opts: AgentRunOptions): Promise<AgentResult> {
    const provider: AgentProvider = this.providers.resolve(opts.provider);
    const page: Page | (() => Page) = opts.page;

    const session = new BrowserAgentSession({
      task,
      system: opts.system,
      maxSteps: opts.maxSteps ?? 15,
      signal: opts.signal,
      actions: opts.actions ?? browserActions,
      page: typeof page === 'function' ? page : (): Page => page,
      timeout: opts.timeout ?? 5000,
      onStep: opts.onStep,
    });

    try {
      const outcome: AgentLoopOutcome = await provider.run(session);

      return session.result(outcome.stopReason);
    } catch (err) {
      // Providers may throw when the signal aborts an in-flight model call.
      if (opts.signal?.aborted) return session.result('Cancelled.');

      throw err;
    }
  }
}
