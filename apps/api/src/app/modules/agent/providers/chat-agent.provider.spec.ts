import type { Page } from 'playwright-core';
import type { Action } from '../actions/browser-actions';
import { BrowserAgentSession } from '../agent-session';
import type { AgentLoopOutcome, LLMResponse, Message, ToolResult } from '../types/agent.types';
import { ChatAgentProvider, type ChatRequest } from './chat-agent.provider';

/** Replays scripted replies and records what it was sent. */
class ScriptedProvider extends ChatAgentProvider {
  readonly name = 'scripted';
  readonly requests: Message[][] = [];

  constructor(
    readonly vision: boolean,
    private readonly replies: LLMResponse[],
  ) {
    super();
  }

  protected async chat(request: ChatRequest): Promise<LLMResponse> {
    this.requests.push(structuredClone(request.messages));
    const reply: LLMResponse | undefined = this.replies.shift();
    if (!reply) throw new Error('No scripted reply left');
    return reply;
  }
}

function action(name: string, result: ToolResult): Action {
  return {
    definition: { name, description: name, parameters: { type: 'object', properties: {} } },
    run: async (): Promise<ToolResult> => result,
  };
}

const ACTIONS: Record<string, Action> = {
  look: action('look', { text: 'a banner', imageBase64: 'PNG' }),
  done: action('done', { text: 'ok' }),
};

function session(maxSteps: number, signal?: AbortSignal): BrowserAgentSession {
  return new BrowserAgentSession({
    task: 'task',
    system: 'system',
    maxSteps,
    signal,
    actions: ACTIONS,
    page: (): Page => ({}) as Page,
    timeout: 1000,
  });
}

const call = (name: string, args: Record<string, unknown> = {}): LLMResponse => ({
  text: '',
  toolCalls: [{ id: name, name, args }],
});
const prose = (text: string): LLMResponse => ({ text, toolCalls: [] });

describe('ChatAgentProvider', () => {
  it('runs tool calls until the agent calls done', async () => {
    const provider: ScriptedProvider = new ScriptedProvider(true, [
      call('look'),
      call('done', { success: true, summary: 'Rule works' }),
    ]);
    const s: BrowserAgentSession = session(10);

    const outcome: AgentLoopOutcome = await provider.run(s);

    expect(outcome.stopReason).toBe('Rule works');
    expect(s.result(outcome.stopReason)).toMatchObject({ success: true, summary: 'Rule works' });
    expect(s.steps.map((step) => step.call.name)).toEqual(['look', 'done']);
  });

  it('nudges a model that answers in prose, then gives up after two nudges', async () => {
    const provider: ScriptedProvider = new ScriptedProvider(true, [prose('hmm'), prose('well'), prose('I cannot')]);
    const outcome: AgentLoopOutcome = await provider.run(session(10));

    expect(outcome.stopReason).toBe('I cannot');
    expect(provider.requests).toHaveLength(3);
    expect(provider.requests[1]?.at(-1)).toEqual({ role: 'user', content: expect.stringContaining('tool call') });
  });

  it('stops at the turn limit', async () => {
    const provider: ScriptedProvider = new ScriptedProvider(true, [call('look'), call('look')]);
    expect(await provider.run(session(2))).toEqual({ stopReason: 'Gave up after 2 steps.' });
  });

  it.each([
    [true, 'PNG'],
    [false, undefined],
  ])('with vision=%p sends screenshots to the model as %p', async (vision: boolean, image: string | undefined) => {
    const provider: ScriptedProvider = new ScriptedProvider(vision, [call('look'), call('done', { success: true })]);
    await provider.run(session(5));

    const toolMessage: Message | undefined = provider.requests[1]?.find((m: Message): boolean => m.role === 'tool');
    expect(toolMessage?.role).toBe('tool');
    expect(toolMessage?.role === 'tool' ? toolMessage.result.imageBase64 : 'no tool message').toBe(image);
  });

  it('stops before the next turn once the signal aborts', async () => {
    const abort: AbortController = new AbortController();
    abort.abort();
    const provider: ScriptedProvider = new ScriptedProvider(true, [call('look')]);
    const s: BrowserAgentSession = session(5, abort.signal);

    const outcome: AgentLoopOutcome = await provider.run(s);

    expect(provider.requests).toHaveLength(0);
    expect(s.result(outcome.stopReason)).toMatchObject({ success: false, cancelled: true });
  });
});
