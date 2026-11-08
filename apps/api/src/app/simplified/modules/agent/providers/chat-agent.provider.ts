import type { AgentLoopOutcome, AgentProvider, AgentSession } from '../interfaces';
import type { LLMResponse, Message, ToolDefinition, ToolResult } from '../types';

/** One model turn: the conversation so far in, the reply (text and/or tool calls) out. */
export interface ChatRequest {
  system: string;
  messages: Message[];
  tools: ToolDefinition[];
  signal?: AbortSignal;
}

/** Times a model may answer in prose before the run stops. */
const MAX_NUDGES = 2;
const NUDGE = 'Respond only with a tool call. Call `done` when finished.';

/**
 * Base for plain chat models (Claude API, Ollama): runs the agent loop, so a subclass only
 * translates one turn to and from its API in `chat()`.
 */
export abstract class ChatAgentProvider implements AgentProvider {
  abstract readonly name: string;
  abstract readonly vision: boolean;

  protected abstract chat(request: ChatRequest): Promise<LLMResponse>;

  async run(session: AgentSession): Promise<AgentLoopOutcome> {
    const { task, system, tools, maxSteps, signal } = session;
    const messages: Message[] = [{ role: 'user', content: task }];
    let nudges = 0;

    for (let turn = 0; turn < maxSteps; turn++) {
      if (signal?.aborted) return { stopReason: 'Cancelled.' };
      const reply: LLMResponse = await this.chat({ system, messages, tools, signal });
      messages.push({ role: 'assistant', content: reply.text, toolCalls: reply.toolCalls });

      if (reply.toolCalls.length === 0) {
        // Small local models sometimes answer in prose. Nudge them back to tools a couple of times.
        if (++nudges > MAX_NUDGES) return { stopReason: reply.text || 'Model stopped calling tools.' };
        messages.push({ role: 'user', content: NUDGE });
        continue;
      }

      for (const call of reply.toolCalls) {
        const result: ToolResult = await session.execute(call);
        messages.push({ role: 'tool', toolCallId: call.id, name: call.name, result: this.vision ? result : withoutImage(result) });
        if (session.finished) return { stopReason: session.finished.summary };
      }
    }
    return { stopReason: `Gave up after ${maxSteps} steps.` };
  }
}

function withoutImage(result: ToolResult): ToolResult {
  if (!result.imageBase64) return result;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { imageBase64: _omitted, ...rest } = result;
  return rest;
}
