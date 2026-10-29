import Anthropic, { ClientOptions } from '@anthropic-ai/sdk';
import type { BetaRunnableTool } from '@anthropic-ai/sdk/lib/tools/BetaRunnableTool';
import type {
  BetaToolRunner,
  BetaToolRunnerParams,
} from '@anthropic-ai/sdk/lib/tools/BetaToolRunner';
import {
  BackendDescription,
  ContentBlock,
  DetectionBackend,
  RunOutcome,
  RunSession,
  ToolCall,
  toolFailure,
  ToolResult,
  TokenUsage,
  TurnEvent,
} from '@banner-sweeper/llm-backend';
import { BackendEntry } from './backend-config';
import { fromToolResultContent, toBetaContent } from './content-blocks';
import { SequentialTools } from './sequential-tools';

type BetaContentBlock = Anthropic.Beta.Messages.BetaContentBlock;
type BetaContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;
type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type BetaMessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type BetaToolResultBlockParam =
  Anthropic.Beta.Messages.BetaToolResultBlockParam;
type BetaToolUseBlock = Anthropic.Beta.Messages.BetaToolUseBlock;
type BetaUserMessageParam = Anthropic.Beta.Messages.BetaUserMessageParam;

const MAX_RETRIES = 2;

/** What every turn's request carries, before a subclass adds what its server understands. */
export interface BaseRequest {
  model: string;
  max_tokens: number;
  system: string;
  tools: BetaRunnableTool<unknown>[];
  messages: BetaMessageParam[];
}

/**
 * The agent loop for every backend that speaks `/v1/messages` (ADR-0009), over the SDK's Tool Runner. The runner
 * sends the full history every turn (`thread: false`) and never streams.
 */
export abstract class AnthropicMessagesBackend implements DetectionBackend {
  readonly description: BackendDescription;

  private readonly client: Anthropic;

  constructor(
    protected readonly entry: BackendEntry,
    clientOptions: ClientOptions,
  ) {
    this.description = {
      backend: entry.id,
      model: entry.model,
      effort: entry.effort ?? null,
      pricing: entry.pricing ?? null,
    };
    this.client = new Anthropic({
      ...clientOptions,
      baseURL: entry.baseURL,
      maxRetries: MAX_RETRIES,
    });
  }

  /** The request params of every turn: `request` plus the fields this backend's server understands. */
  protected abstract requestParams(request: BaseRequest): BetaToolRunnerParams;

  async *run(
    session: RunSession,
  ): AsyncGenerator<TurnEvent, RunOutcome, undefined> {
    const tools: SequentialTools = new SequentialTools(session.signal);
    const runner: BetaToolRunner<false> = this.client.beta.messages.toolRunner(
      {
        ...this.requestParams({
          model: this.entry.model,
          max_tokens: this.entry.maxTokens,
          system: session.system,
          tools: session.tools.map(tools.wrap.bind(tools)),
          messages: [
            { role: 'user', content: session.firstMessage.map(toBetaContent) },
          ],
        }),
        thread: false,
        max_iterations: session.maxTurns,
      },
      { signal: session.signal },
    );

    let turn = 0;
    try {
      for await (const message of runner) {
        turn++;
        // Run the turn's tools now rather than when the runner sends the next turn, so a terminal tool can end the run
        // before that request goes out. The runner reuses these results.
        const toolResults: BetaUserMessageParam | null =
          message.stop_reason === 'tool_use'
            ? await runner.generateToolResponse()
            : null;

        yield turnEvent(turn, message, toolResults);

        const outcome: RunOutcome | null = outcomeAfterTurn(
          message,
          turn,
          session,
          tools,
        );
        if (outcome) {
          return outcome;
        }
      }
    } catch (error: unknown) {
      if (session.signal.aborted) {
        return { kind: 'aborted' };
      }
      return { kind: 'failed', message: errorMessage(error) };
    }

    return { kind: 'failed', message: 'The tool runner stopped early.' };
  }
}

function outcomeAfterTurn(
  message: BetaMessage,
  turn: number,
  session: RunSession,
  tools: SequentialTools,
): RunOutcome | null {
  if (tools.terminalTool) {
    return { kind: 'terminal', tool: tools.terminalTool };
  }
  if (session.signal.aborted) {
    return { kind: 'aborted' };
  }

  switch (message.stop_reason) {
    // The runner sends a paused turn back as it is, so the server continues it.
    case 'tool_use':
    case 'pause_turn':
      return turn >= session.maxTurns ? { kind: 'maxTurns' } : null;
    case 'end_turn':
    case 'stop_sequence':
      return { kind: 'endTurn' };
    case 'refusal':
      return { kind: 'refused' };
    case 'max_tokens':
      return {
        kind: 'failed',
        message: message.content.some(isToolUse)
          ? 'A tool call was cut off by max_tokens.'
          : 'The reply was cut off by max_tokens.',
      };
    default:
      return {
        kind: 'failed',
        message: `Unexpected stop_reason: ${message.stop_reason}`,
      };
  }
}

function turnEvent(
  turn: number,
  message: BetaMessage,
  toolResults: BetaUserMessageParam | null,
): TurnEvent {
  const results: BetaToolResultBlockParam[] = Array.isArray(
    toolResults?.content,
  )
    ? toolResults.content.filter(isToolResult)
    : [];

  return {
    turn,
    assistantText: message.content
      .flatMap((block: BetaContentBlock): string[] =>
        block.type === 'text' ? [block.text] : [],
      )
      .join('\n'),
    toolCalls: message.content
      .filter(isToolUse)
      .map((toolUse: BetaToolUseBlock): ToolCall => {
        const result: BetaToolResultBlockParam | undefined = results.find(
          (candidate: BetaToolResultBlockParam): boolean =>
            candidate.tool_use_id === toolUse.id,
        );
        return {
          name: toolUse.name,
          input: toolUse.input,
          result: toolResult(result),
        };
      }),
    usage: tokenUsage(message),
  };
}

function toolResult(block: BetaToolResultBlockParam | undefined): ToolResult {
  if (!block) {
    return toolFailure('Not run.');
  }
  const content: ContentBlock[] = fromToolResultContent(block.content);
  return block.is_error ? toolFailure(content) : content;
}

function tokenUsage(message: BetaMessage): TokenUsage {
  return {
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
  };
}

function isToolResult(
  block: BetaContentBlockParam,
): block is BetaToolResultBlockParam {
  return block.type === 'tool_result';
}

function isToolUse(block: BetaContentBlock): block is BetaToolUseBlock {
  return block.type === 'tool_use';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
