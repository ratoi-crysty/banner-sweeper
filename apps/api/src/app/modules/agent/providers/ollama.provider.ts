import type { LLMResponse, Message, ToolCall } from '../types/agent.types';
import { ChatAgentProvider, type ChatRequest } from './chat-agent.provider';

export interface OllamaProviderOptions {
  /** Default http://localhost:11434. */
  host?: string;
  /** Must be a tool-capable model (qwen3, llama3.1, mistral-nemo, …). */
  model?: string;
  /** Set true for vision models (e.g. qwen2.5vl) so screenshots get forwarded. */
  vision?: boolean;
  /** Passed through to Ollama (temperature, num_ctx, …). */
  options?: Record<string, unknown>;
}

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[];
  tool_name?: string;
  images?: string[];
}

interface OllamaChatResponse {
  message: {
    content?: string;
    tool_calls?: { function: { name: string; arguments: Record<string, unknown> | string } }[];
  };
}

/** Ollama's native /api/chat with `tools`. No SDK dependency. */
export class OllamaProvider extends ChatAgentProvider {
  readonly name = 'ollama';
  readonly vision: boolean;
  private readonly host: string;
  private readonly model: string;
  private readonly options: Record<string, unknown>;
  private counter = 0;

  constructor(opts: OllamaProviderOptions = {}) {
    super();
    this.host = (opts.host ?? 'http://localhost:11434').replace(/\/$/, '');
    this.model = opts.model ?? 'qwen3:8b';
    this.vision = opts.vision ?? false;
    this.options = { temperature: 0, num_ctx: 16384, ...opts.options };
  }

  protected async chat({ system, messages, tools, signal }: ChatRequest): Promise<LLMResponse> {
    const res: Response = await fetch(`${this.host}/api/chat`, {
      method: 'POST',
      signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        options: this.options,
        tools: tools.map((t) => ({ type: 'function', function: t })),
        messages: [{ role: 'system', content: system }, ...messages.map(toOllama)],
      }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const data: OllamaChatResponse = (await res.json()) as OllamaChatResponse;

    const toolCalls: ToolCall[] = (data.message.tool_calls ?? []).map(
      (c): ToolCall => ({
        id: `call_${++this.counter}`,
        name: c.function.name,
        args:
          typeof c.function.arguments === 'string'
            ? (JSON.parse(c.function.arguments) as Record<string, unknown>)
            : (c.function.arguments ?? {}),
      }),
    );
    // Strip <think> blocks emitted by reasoning models.
    const text: string = (data.message.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    return { text, toolCalls };
  }
}

/** Images are only present when `vision` is on: ChatAgentProvider strips them otherwise. */
function toOllama(m: Message): OllamaMessage {
  if (m.role === 'user') return { role: 'user', content: m.content };
  if (m.role === 'assistant') {
    return {
      role: 'assistant',
      content: m.content,
      tool_calls: m.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.args } })),
    };
  }
  return {
    role: 'tool',
    tool_name: m.name,
    content: m.result.isError ? `ERROR: ${m.result.text}` : m.result.text,
    ...(m.result.imageBase64 ? { images: [m.result.imageBase64] } : {}),
  };
}
