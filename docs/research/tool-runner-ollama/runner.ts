/**
 * Runs the Tool Runner against Ollama with a two-tool loop: `screenshot` returns a base64 PNG inside the
 * tool_result, `finish` ends the loop. Usage: tsx runner.ts <threaded|unthreaded> [stream]
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodTool } from '@anthropic-ai/sdk/helpers/beta/zod';
import { BetaRunnableTool } from '@anthropic-ai/sdk/lib/tools/BetaRunnableTool';
import { mkdirSync, writeFileSync } from 'node:fs';
import * as z from 'zod/v4';
import { bannerScreenshot, MODEL, ollamaClient, randomCanary, WireRecord, wireLog } from './shared';

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type BetaContentBlock = Anthropic.Beta.Messages.BetaContentBlock;
type BetaToolResultContentBlockParam = Anthropic.Beta.Messages.BetaToolResultContentBlockParam;

const FinishInput = z.object({
  codeWord: z.string().describe('The code word printed on the consent banner, exactly as shown'),
  buttonLabels: z.array(z.string()).describe('The labels of the banner buttons, left to right'),
});
type FinishInput = z.infer<typeof FinishInput>;

interface TurnRecord {
  stopReason: string | null;
  blockTypes: string[];
  toolCalls: string[];
  text: string;
  inputTokens: number;
  outputTokens: number;
}

interface RunResult {
  mode: string;
  stream: boolean;
  model: string;
  canary: string;
  screenshotCalls: number;
  finishInput: FinishInput | null;
  imageReachedModel: boolean;
  endedBy: 'finish' | 'end_turn_without_finish' | 'max_iterations' | 'error';
  error: string | null;
  turns: TurnRecord[];
  wire: WireRecord[];
  durationMs: number;
}

function describeTurn(message: BetaMessage): TurnRecord {
  return {
    stopReason: message.stop_reason,
    blockTypes: message.content.map((b: BetaContentBlock) => b.type),
    toolCalls: message.content.flatMap((b: BetaContentBlock) => (b.type === 'tool_use' ? [`${b.name}(${JSON.stringify(b.input)})`] : [])),
    text: message.content.flatMap((b: BetaContentBlock) => (b.type === 'text' ? [b.text] : [])).join('\n').slice(0, 400),
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
  };
}

function calledFinish(message: BetaMessage): boolean {
  return message.content.some((b: BetaContentBlock) => b.type === 'tool_use' && b.name === 'finish');
}

async function main(): Promise<void> {
  const mode: string = process.argv[2] ?? 'threaded';
  const stream: boolean = process.argv[3] === 'stream';
  const canary: string = randomCanary();
  const png: string = await bannerScreenshot(canary);
  let screenshotCalls = 0;
  let finishInput: FinishInput | null = null;

  const screenshot: BetaRunnableTool<Record<string, never>> = betaZodTool({
    name: 'screenshot',
    description: 'Take a screenshot of the current browser page. Returns the image.',
    inputSchema: z.object({}),
    run: (): BetaToolResultContentBlockParam[] => {
      screenshotCalls++;
      return [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } }];
    },
  });
  const finish: BetaRunnableTool<FinishInput> = betaZodTool({
    name: 'finish',
    description: 'Report what the consent banner shows. Call this once, after looking at the screenshot.',
    inputSchema: FinishInput,
    run: (input: FinishInput): string => {
      finishInput = input;
      return 'Recorded.';
    },
  });

  const client: Anthropic = ollamaClient();
  const params = {
    model: MODEL,
    max_tokens: 4096,
    max_iterations: 6,
    system:
      'You are a browser agent. You cannot see the page until you call the screenshot tool. ' +
      'Call screenshot first, then call finish with the code word printed on the consent banner and the button labels. ' +
      'Never guess the code word: read it from the screenshot.',
    tools: [screenshot, finish],
    messages: [{ role: 'user' as const, content: 'What does the consent banner on this page say?' }],
    ...(mode === 'unthreaded' ? { thread: false as const } : {}),
  };

  const turns: TurnRecord[] = [];
  let endedBy: RunResult['endedBy'] = 'max_iterations';
  let error: string | null = null;
  const started: number = Date.now();
  try {
    if (stream) {
      const runner = client.beta.messages.toolRunner({ ...params, stream: true });
      for await (const turnStream of runner) {
        const message: BetaMessage = await turnStream.finalMessage();
        turns.push(describeTurn(message));
        if (message.stop_reason !== 'tool_use') endedBy = 'end_turn_without_finish';
      }
    } else {
      const runner = client.beta.messages.toolRunner(params);
      for await (const message of runner) {
        turns.push(describeTurn(message));
        if (message.stop_reason !== 'tool_use') endedBy = 'end_turn_without_finish';
      }
    }
  } catch (e: unknown) {
    endedBy = 'error';
    error = e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e);
  }
  // The runner runs `finish` and asks for one more reply, so a run that finished ends on that reply.
  if (finishInput !== null && endedBy !== 'error') endedBy = 'finish';
  const finished: FinishInput | null = finishInput;

  const result: RunResult = {
    mode,
    stream,
    model: MODEL,
    canary,
    screenshotCalls,
    finishInput: finished,
    imageReachedModel: finished !== null && (finished as FinishInput).codeWord.toUpperCase().includes(canary),
    endedBy,
    error,
    turns,
    wire: wireLog,
    durationMs: Date.now() - started,
  };
  mkdirSync('results', { recursive: true });
  const file: string = `results/runner-${mode}${stream ? '-stream' : ''}-${MODEL.replace(/[:/]/g, '_')}-${Date.now()}.json`;
  writeFileSync(file, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ ...result, wire: result.wire.map((w: WireRecord) => ({ ...w, responseSnippet: w.responseSnippet.slice(0, 200) })) }, null, 2));
  console.log(`saved ${file}`);
}

void main();
