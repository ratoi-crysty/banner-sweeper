import type Anthropic from '@anthropic-ai/sdk';

type BetaContentBlock = Anthropic.Beta.Messages.BetaContentBlock;
type BetaStopReason = Anthropic.Beta.Messages.BetaStopReason;

export interface FakeReply {
  content: BetaContentBlock[];
  stopReason: BetaStopReason;
  usage?: Partial<FakeUsage>;
}

export interface FakeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface FakeErrorReply {
  status: number;
  message: string;
}

export interface RecordedRequest {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

export interface FakeMessagesApi {
  fetch: typeof fetch;
  requests: RecordedRequest[];
}

/**
 * Stands in for `POST /v1/messages`: answers each request with the next canned reply, and records what was sent.
 * A request beyond the script fails the test.
 */
export function fakeMessagesApi(
  replies: (FakeReply | FakeErrorReply)[],
): FakeMessagesApi {
  const requests: RecordedRequest[] = [];
  const remaining: (FakeReply | FakeErrorReply)[] = [...replies];

  const fakeFetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    init?.signal?.throwIfAborted();
    requests.push({
      url: String(input),
      headers: new Headers(init?.headers),
      // The SDK always sends a JSON object body.
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });

    const reply: FakeReply | FakeErrorReply | undefined = remaining.shift();
    if (!reply) {
      throw new Error(`Unexpected request #${requests.length}`);
    }
    if ('status' in reply) {
      return Response.json(
        {
          type: 'error',
          error: { type: 'invalid_request_error', message: reply.message },
        },
        { status: reply.status },
      );
    }
    return Response.json({
      id: `msg_${requests.length}`,
      type: 'message',
      role: 'assistant',
      model: String(requests.at(-1)?.body['model']),
      content: reply.content,
      stop_reason: reply.stopReason,
      stop_sequence: null,
      stop_details: null,
      container: null,
      context_management: null,
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        ...reply.usage,
      },
    });
  };

  return { fetch: fakeFetch, requests };
}

export function textBlock(text: string): BetaContentBlock {
  return { type: 'text', text, citations: null };
}

export function thinkingBlock(thinking: string): BetaContentBlock {
  return { type: 'thinking', thinking, signature: 'sig' };
}

export function toolUseBlock(
  id: string,
  name: string,
  input: Record<string, unknown>,
): BetaContentBlock {
  return { type: 'tool_use', id, name, input };
}
