import {
  RunSession,
  ToolCall,
  ToolDefinition,
  ToolResult,
  TurnEvent,
} from '@banner-sweeper/llm-backend';
import { z } from 'zod';
import { BackendEntry } from './backend-config';
import { ClaudeBackend } from './claude-backend';
import {
  FakeErrorReply,
  FakeMessagesApi,
  FakeReply,
  fakeMessagesApi,
  textBlock,
  thinkingBlock,
  toolUseBlock,
} from './testing/fake-messages-api';
import { CounterInput, drain, RunResult, toyTools } from './testing/toy-tools';

const OPUS: BackendEntry = {
  id: 'claude-opus',
  kind: 'claude',
  model: 'claude-opus-5-5',
  effort: 'medium',
  maxTokens: 16000,
};

interface FakeRunResult extends RunResult {
  api: FakeMessagesApi;
}

function session(overrides: Partial<RunSession> = {}): RunSession {
  return {
    system: 'Count, then finish.',
    firstMessage: [{ type: 'text', text: 'Count to 3.' }],
    tools: toyTools(),
    maxTurns: 10,
    signal: new AbortController().signal,
    ...overrides,
  };
}

/** A `count` tool that does whatever `run` does. */
function countTool(
  run: () => Promise<ToolResult>,
): ToolDefinition<CounterInput> {
  return {
    name: 'count',
    description: 'Add a number to the counter.',
    inputSchema: z.object({ by: z.number() }),
    readOnly: false,
    terminal: false,
    run,
  };
}

async function runAgainst(
  replies: (FakeReply | FakeErrorReply)[],
  runSession: RunSession = session(),
): Promise<FakeRunResult> {
  const api: FakeMessagesApi = fakeMessagesApi(replies);
  const backend: ClaudeBackend = new ClaudeBackend(OPUS, {
    apiKey: 'test-key',
    fetch: api.fetch,
  });
  return { ...(await drain(backend.run(runSession))), api };
}

describe('ClaudeBackend', () => {
  it('ends the run as soon as a terminal tool succeeds, without asking the model again', async () => {
    const { events, outcome, api }: FakeRunResult = await runAgainst([
      {
        content: [toolUseBlock('t1', 'count', { by: 3 })],
        stopReason: 'tool_use',
      },
      {
        content: [toolUseBlock('t2', 'finish', { total: 3 })],
        stopReason: 'tool_use',
      },
    ]);

    expect(outcome).toEqual({ kind: 'terminal', tool: 'finish' });
    expect(api.requests).toHaveLength(2);
    expect(events.map((event: TurnEvent) => event.toolCalls)).toEqual([
      [
        {
          name: 'count',
          input: { by: 3 },
          result: [{ type: 'text', text: 'counter: 3' }],
        },
      ],
      [
        {
          name: 'finish',
          input: { total: 3 },
          result: [{ type: 'text', text: 'done' }],
        },
      ],
    ]);
  });

  it('sends a failed terminal call back as an error and keeps going', async () => {
    const { events, outcome, api }: FakeRunResult = await runAgainst([
      {
        content: [toolUseBlock('t1', 'finish', { total: 7 })],
        stopReason: 'tool_use',
      },
      { content: [textBlock('I give up.')], stopReason: 'end_turn' },
    ]);

    expect(outcome).toEqual({ kind: 'endTurn' });
    expect(events[0]?.toolCalls[0]?.result).toEqual({
      type: 'toolFailure',
      content: [{ type: 'text', text: 'wrong total, the counter is 0' }],
    });
    expect(api.requests[1]?.body['messages']).toContainEqual({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: 't1',
          content: [{ type: 'text', text: 'wrong total, the counter is 0' }],
          is_error: true,
        },
      ],
    });
  });

  it("ends with endTurn and the reply's text, keeping thinking out of the event", async () => {
    const { events, outcome }: FakeRunResult = await runAgainst([
      {
        content: [
          thinkingBlock('secret reasoning'),
          textBlock('No banner here.'),
        ],
        stopReason: 'end_turn',
      },
    ]);

    expect(outcome).toEqual({ kind: 'endTurn' });
    expect(events).toHaveLength(1);
    expect(events[0]?.assistantText).toBe('No banner here.');
    expect(JSON.stringify(events)).not.toContain('secret reasoning');
  });

  it('ends with refused when the model refuses', async () => {
    const { outcome }: FakeRunResult = await runAgainst([
      { content: [], stopReason: 'refusal' },
    ]);

    expect(outcome).toEqual({ kind: 'refused' });
  });

  it('fails without running a tool call that max_tokens cut off', async () => {
    let ran = false;
    const probe: ToolDefinition = countTool(async (): Promise<ToolResult> => {
      ran = true;
      return [];
    });

    const { outcome, api }: FakeRunResult = await runAgainst(
      [
        {
          content: [toolUseBlock('t1', 'count', { by: 1 })],
          stopReason: 'max_tokens',
        },
      ],
      session({ tools: [probe] }),
    );

    expect(outcome).toEqual({
      kind: 'failed',
      message: 'A tool call was cut off by max_tokens.',
    });
    expect(ran).toBe(false);
    expect(api.requests).toHaveLength(1);
  });

  it('continues a paused turn', async () => {
    const { outcome, api }: FakeRunResult = await runAgainst([
      { content: [textBlock('Still looking…')], stopReason: 'pause_turn' },
      { content: [textBlock('Done.')], stopReason: 'end_turn' },
    ]);

    expect(outcome).toEqual({ kind: 'endTurn' });
    expect(api.requests).toHaveLength(2);
    expect(api.requests[1]?.body['messages']).toEqual([
      expect.objectContaining({ role: 'user' }),
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Still looking…', citations: null }],
      },
    ]);
  });

  it('stops at maxTurns', async () => {
    const { events, outcome, api }: FakeRunResult = await runAgainst(
      [
        {
          content: [toolUseBlock('t1', 'count', { by: 1 })],
          stopReason: 'tool_use',
        },
        {
          content: [toolUseBlock('t2', 'count', { by: 1 })],
          stopReason: 'tool_use',
        },
      ],
      session({ maxTurns: 2 }),
    );

    expect(outcome).toEqual({ kind: 'maxTurns' });
    expect(events).toHaveLength(2);
    expect(api.requests).toHaveLength(2);
  });

  it('stops as aborted when the signal fires during a tool call', async () => {
    const controller: AbortController = new AbortController();
    const aborting: ToolDefinition = countTool(
      async (): Promise<ToolResult> => {
        controller.abort();
        return [{ type: 'text', text: 'aborted mid-call' }];
      },
    );

    const { outcome, api }: FakeRunResult = await runAgainst(
      [
        {
          content: [toolUseBlock('t1', 'count', { by: 1 })],
          stopReason: 'tool_use',
        },
      ],
      session({
        tools: [aborting],
        signal: controller.signal,
      }),
    );

    expect(outcome).toEqual({ kind: 'aborted' });
    expect(api.requests).toHaveLength(1);
  });

  it('stops as aborted when the signal fires before a request', async () => {
    const controller: AbortController = new AbortController();
    controller.abort();

    const { outcome }: FakeRunResult = await runAgainst(
      [{ content: [textBlock('never sent')], stopReason: 'end_turn' }],
      session({ signal: controller.signal }),
    );

    expect(outcome).toEqual({ kind: 'aborted' });
  });

  it('fails with the error when the API rejects a request', async () => {
    const { outcome }: FakeRunResult = await runAgainst([
      { status: 400, message: 'tools.0.name: invalid' },
    ]);

    expect(outcome).toMatchObject({ kind: 'failed' });
    expect(outcome.kind === 'failed' && outcome.message).toContain(
      'tools.0.name: invalid',
    );
  });

  it('runs several calls of one turn one at a time, in order', async () => {
    const log: string[] = [];
    const timed = (name: string, ms: number): ToolDefinition => ({
      name,
      description: `Takes ${ms} ms.`,
      inputSchema: z.object({}),
      readOnly: true,
      terminal: false,
      run: async (): Promise<ToolResult> => {
        log.push(`start ${name}`);
        await new Promise((resolve: (value: unknown) => void): void => {
          setTimeout(resolve, ms);
        });
        log.push(`end ${name}`);
        return [{ type: 'text', text: name }];
      },
    });

    const { events }: FakeRunResult = await runAgainst(
      [
        {
          content: [
            toolUseBlock('t1', 'slow', {}),
            toolUseBlock('t2', 'fast', {}),
          ],
          stopReason: 'tool_use',
        },
        { content: [textBlock('ok')], stopReason: 'end_turn' },
      ],
      session({ tools: [timed('slow', 30), timed('fast', 0)] }),
    );

    expect(log).toEqual(['start slow', 'end slow', 'start fast', 'end fast']);
    expect(
      events[0]?.toolCalls.map((call: ToolCall): string => call.name),
    ).toEqual(['slow', 'fast']);
  });

  it("doesn't run the calls after a terminal call that succeeded", async () => {
    const { events, outcome, api }: FakeRunResult = await runAgainst([
      {
        content: [
          toolUseBlock('t1', 'finish', { total: 0 }),
          toolUseBlock('t2', 'count', { by: 1 }),
        ],
        stopReason: 'tool_use',
      },
    ]);

    expect(outcome).toEqual({ kind: 'terminal', tool: 'finish' });
    expect(api.requests).toHaveLength(1);
    expect(events[0]?.toolCalls[1]?.result).toEqual({
      type: 'toolFailure',
      content: [
        { type: 'text', text: 'Not run: finish already ended the run.' },
      ],
    });
  });

  it('carries images both ways as base64', async () => {
    const screenshot: ToolDefinition = {
      name: 'screenshot',
      description: 'Take a screenshot.',
      inputSchema: z.object({}),
      readOnly: true,
      terminal: false,
      run: async (): Promise<ToolResult> => [
        { type: 'image', mediaType: 'image/jpeg', data: 'AAAA' },
      ],
    };

    const { events, api }: FakeRunResult = await runAgainst(
      [
        {
          content: [toolUseBlock('t1', 'screenshot', {})],
          stopReason: 'tool_use',
        },
        { content: [textBlock('ok')], stopReason: 'end_turn' },
      ],
      session({
        tools: [screenshot],
        firstMessage: [
          { type: 'text', text: 'https://example.org/' },
          { type: 'image', mediaType: 'image/jpeg', data: 'BBBB' },
        ],
      }),
    );

    expect(events[0]?.toolCalls[0]?.result).toEqual([
      { type: 'image', mediaType: 'image/jpeg', data: 'AAAA' },
    ]);
    const messages: unknown = api.requests[1]?.body['messages'];
    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'https://example.org/' },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/jpeg', data: 'BBBB' },
          },
        ],
      },
      expect.objectContaining({ role: 'assistant' }),
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 't1',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: 'AAAA',
                },
              },
            ],
          },
        ],
      },
    ]);
  });

  it("reports each turn's token usage", async () => {
    const { events }: FakeRunResult = await runAgainst([
      {
        content: [textBlock('ok')],
        stopReason: 'end_turn',
        usage: {
          input_tokens: 120,
          output_tokens: 45,
          cache_read_input_tokens: 9000,
          cache_creation_input_tokens: 300,
        },
      },
    ]);

    expect(events[0]?.usage).toEqual({
      inputTokens: 120,
      outputTokens: 45,
      cacheReadTokens: 9000,
      cacheWriteTokens: 300,
    });
  });

  it('describes itself from its config entry', () => {
    const backend: ClaudeBackend = new ClaudeBackend(
      {
        ...OPUS,
        pricing: {
          inputPerMTok: 4,
          outputPerMTok: 20,
          cacheReadPerMTok: 0.2,
          cacheWritePerMTok: 5,
        },
      },
      { apiKey: 'test-key' },
    );

    expect(backend.description).toEqual({
      backend: 'claude-opus',
      model: 'claude-opus-5-5',
      effort: 'medium',
      pricing: {
        inputPerMTok: 4,
        outputPerMTok: 20,
        cacheReadPerMTok: 0.2,
        cacheWritePerMTok: 5,
      },
    });
  });

  describe('requests', () => {
    it('asks for effort, adaptive thinking and server-side fallbacks, non-streaming', async () => {
      const { api }: FakeRunResult = await runAgainst([
        { content: [textBlock('ok')], stopReason: 'end_turn' },
      ]);

      expect(api.requests[0]?.body).toMatchObject({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'medium' },
        fallbacks: 'default',
      });
      expect(api.requests[0]?.body['stream']).toBeFalsy();
      expect(api.requests[0]?.headers.get('anthropic-beta')).toContain(
        'server-side-fallback-2026-07-01',
      );
    });

    it('caches the growing history with automatic caching', async () => {
      const { api }: FakeRunResult = await runAgainst([
        { content: [textBlock('ok')], stopReason: 'end_turn' },
      ]);

      expect(api.requests[0]?.body['cache_control']).toEqual({
        type: 'ephemeral',
      });
    });

    it('puts cache breakpoints on the system prompt and the last tool', async () => {
      const { api }: FakeRunResult = await runAgainst([
        { content: [textBlock('ok')], stopReason: 'end_turn' },
      ]);

      expect(api.requests[0]?.body['system']).toEqual([
        {
          type: 'text',
          text: 'Count, then finish.',
          cache_control: { type: 'ephemeral' },
        },
      ]);
      expect(api.requests[0]?.body['tools']).toEqual([
        expect.not.objectContaining({ cache_control: expect.anything() }),
        expect.objectContaining({
          name: 'finish',
          cache_control: { type: 'ephemeral' },
        }),
      ]);
    });

    it('sends the whole history, unchanged, every turn', async () => {
      const { api }: FakeRunResult = await runAgainst([
        {
          content: [
            thinkingBlock('hmm'),
            toolUseBlock('t1', 'count', { by: 3 }),
          ],
          stopReason: 'tool_use',
        },
        {
          content: [toolUseBlock('t2', 'finish', { total: 3 })],
          stopReason: 'tool_use',
        },
      ]);

      expect(api.requests[1]?.body['messages']).toEqual([
        { role: 'user', content: [{ type: 'text', text: 'Count to 3.' }] },
        {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: 'hmm', signature: 'sig' },
            { type: 'tool_use', id: 't1', name: 'count', input: { by: 3 } },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 't1',
              content: [{ type: 'text', text: 'counter: 3' }],
            },
          ],
        },
      ]);
      expect(api.requests[1]?.body).toMatchObject({
        system: api.requests[0]?.body['system'],
        tools: api.requests[0]?.body['tools'],
      });
    });
  });
});
