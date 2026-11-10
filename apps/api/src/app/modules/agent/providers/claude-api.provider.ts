import Anthropic from '@anthropic-ai/sdk';
import type { LLMResponse, Message, ToolCall } from '../types/agent.types';
import { ChatAgentProvider, type ChatRequest } from './chat-agent.provider';

export interface ClaudeApiProviderOptions {
  /** Default: ANTHROPIC_API_KEY. */
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

/** Claude Messages API, billed to the Console organization of the API key. */
export class ClaudeApiProvider extends ChatAgentProvider {
  readonly name = 'claude-api';
  readonly vision = true;
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: ClaudeApiProviderOptions = {}) {
    super();
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model ?? 'claude-sonnet-5-5';
    this.maxTokens = opts.maxTokens ?? 1024;
  }

  protected async chat({ system, messages, tools, signal }: ChatRequest): Promise<LLMResponse> {
    const res: Anthropic.Message = await this.client.messages.create(
      {
        model: this.model,
        max_tokens: this.maxTokens,
        system,
        tools: tools.map(
          (t): Anthropic.Tool => ({
            name: t.name,
            description: t.description,
            input_schema: t.parameters as Anthropic.Tool.InputSchema,
          }),
        ),
        messages: toAnthropic(messages),
      },
      { signal },
    );

    let text = '';
    const toolCalls: ToolCall[] = [];
    for (const block of res.content) {
      if (block.type === 'text') text += block.text;
      if (block.type === 'tool_use')
        toolCalls.push({ id: block.id, name: block.name, args: block.input as Record<string, unknown> });
    }

    return { text, toolCalls };
  }
}

/** Anthropic wants consecutive tool results merged into one user turn. */
function toAnthropic(messages: Message[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === 'user') out.push({ role: 'user', content: m.content });
    else if (m.role === 'assistant') {
      const content: Anthropic.ContentBlockParam[] = [];
      if (m.content) content.push({ type: 'text', text: m.content });
      for (const c of m.toolCalls) content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args });
      out.push({ role: 'assistant', content });
    } else {
      const block: Anthropic.ToolResultBlockParam = {
        type: 'tool_result',
        tool_use_id: m.toolCallId,
        is_error: m.result.isError,
        content: [
          { type: 'text', text: m.result.text },
          ...(m.result.imageBase64
            ? [
                {
                  type: 'image' as const,
                  source: { type: 'base64' as const, media_type: 'image/png' as const, data: m.result.imageBase64 },
                },
              ]
            : []),
        ],
      };
      const prev: Anthropic.MessageParam | undefined = out[out.length - 1];
      if (prev?.role === 'user' && Array.isArray(prev.content)) prev.content.push(block);
      else out.push({ role: 'user', content: [block] });
    }
  }
  return out;
}
