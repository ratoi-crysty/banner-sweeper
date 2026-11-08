import type { Page } from 'playwright';
import type { Action } from './actions/browser-actions';
import { AgentProviderFactory } from './agent-provider.factory';
import { AgentService } from './agent.service';
import type { AgentLoopOutcome, AgentProvider, AgentSession } from './interfaces';
import { ClaudeAgentSdkProvider } from './providers/claude-agent-sdk.provider';
import { ClaudeApiProvider } from './providers/claude-api.provider';
import { OllamaProvider } from './providers/ollama.provider';
import type { AgentResult, AgentModuleOptions, ToolResult } from './types';

const OPTIONS: AgentModuleOptions = { defaultProvider: { type: 'claude-agent-sdk' }, ollamaHost: 'http://ollama:11434' };

const done: Action = {
  definition: { name: 'done', description: 'done', parameters: { type: 'object', properties: {} } },
  run: async (): Promise<ToolResult> => ({ text: 'ok' }),
};

/** A provider with its own loop, like the Agent SDK. */
function provider(run: (session: AgentSession) => Promise<AgentLoopOutcome>): AgentProvider {
  return { name: 'fake', vision: false, run };
}

describe('AgentService', () => {
  const service: AgentService = new AgentService(new AgentProviderFactory(OPTIONS));
  const run = (p: AgentProvider, signal?: AbortSignal): Promise<AgentResult> =>
    service.run('task', { page: {} as Page, system: 'system', provider: p, actions: { done }, signal });

  it("returns the agent's done result", async () => {
    const result: AgentResult = await run(
      provider(async (session: AgentSession): Promise<AgentLoopOutcome> => {
        await session.execute({ id: '1', name: 'done', args: { success: true, summary: 'All good' } });
        return { stopReason: 'ignored' };
      }),
    );
    expect(result).toMatchObject({ success: true, summary: 'All good' });
    expect(result.steps).toHaveLength(1);
  });

  it("uses the provider's stop reason when the agent never called done", async () => {
    const result: AgentResult = await run(provider(async (): Promise<AgentLoopOutcome> => ({ stopReason: 'Out of turns' })));
    expect(result).toEqual({ success: false, summary: 'Out of turns', steps: [] });
  });

  it('reports a cancelled run when the provider throws after the signal aborted', async () => {
    const abort: AbortController = new AbortController();
    const result: AgentResult = await run(
      provider(async (): Promise<AgentLoopOutcome> => {
        abort.abort();
        throw new Error('aborted');
      }),
      abort.signal,
    );
    expect(result).toEqual({ success: false, summary: 'Cancelled.', steps: [], cancelled: true });
  });

  it('rethrows provider errors that are not cancellations', async () => {
    await expect(run(provider(async (): Promise<AgentLoopOutcome> => Promise.reject(new Error('quota'))))).rejects.toThrow('quota');
  });
});

describe('AgentProviderFactory', () => {
  const factory: AgentProviderFactory = new AgentProviderFactory(OPTIONS);

  it('builds the module default when given nothing', () => {
    expect(factory.resolve()).toBeInstanceOf(ClaudeAgentSdkProvider);
  });

  it('builds each provider from its config, with module-level settings filled in', () => {
    expect(factory.create({ type: 'claude-api', model: 'm' })).toBeInstanceOf(ClaudeApiProvider);
    const ollama: AgentProvider = factory.create({ type: 'ollama', vision: true });
    expect(ollama).toBeInstanceOf(OllamaProvider);
    expect(ollama).toMatchObject({ vision: true, host: 'http://ollama:11434' });
  });

  it('reports vision per provider', () => {
    expect([factory.create({ type: 'claude-agent-sdk' }), factory.create({ type: 'claude-api' }), factory.create({ type: 'ollama' })].map((p) => p.vision)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('passes a ready provider through', () => {
    const ready: AgentProvider = provider(async (): Promise<AgentLoopOutcome> => ({ stopReason: '' }));
    expect(factory.resolve(ready)).toBe(ready);
  });
});
