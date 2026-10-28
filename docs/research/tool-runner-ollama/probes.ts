/**
 * Sends one /v1/messages request per Claude-specific or beta field, to see which Ollama rejects,
 * ignores, or honours. Usage: tsx probes.ts
 */
import Anthropic from '@anthropic-ai/sdk';
import { mkdirSync, writeFileSync } from 'node:fs';
import { bannerScreenshot, MODEL, ollamaClient, randomCanary } from './shared';

type BetaMessage = Anthropic.Beta.Messages.BetaMessage;
type BetaContentBlock = Anthropic.Beta.Messages.BetaContentBlock;
type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type ProbeBody = Record<string, unknown>;

interface Probe {
  name: string;
  body: ProbeBody;
  betas?: string[];
}

interface ProbeResult {
  name: string;
  status: number;
  error: string | null;
  stopReason: string | null;
  blockTypes: string[];
  toolCalls: string[];
  text: string;
}

const WEATHER_TOOL: ProbeBody = {
  name: 'get_weather',
  description: 'Get the weather for a city',
  input_schema: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'], additionalProperties: false },
};
const ASK: ProbeBody = { role: 'user', content: 'Say hello in one word.' };
const WEATHER_ASK: ProbeBody = { role: 'user', content: 'What is the weather in Paris?' };

function base(extra: ProbeBody): ProbeBody {
  return { model: MODEL, max_tokens: 512, messages: [ASK], ...extra };
}

function probes(png: string): Probe[] {
  const toolUseTurn: ProbeBody[] = [
    WEATHER_ASK,
    { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_weather', input: { city: 'Paris' } }] },
  ];
  return [
    { name: 'baseline', body: base({}) },
    { name: 'thinking: adaptive', body: base({ thinking: { type: 'adaptive' } }) },
    { name: 'thinking: disabled', body: base({ thinking: { type: 'disabled' } }) },
    { name: 'output_config.effort: low', body: base({ output_config: { effort: 'low' } }) },
    {
      name: 'output_config.format: json_schema',
      body: base({
        messages: [{ role: 'user', content: 'Give a colour and a number.' }],
        output_config: {
          format: {
            type: 'json_schema',
            schema: { type: 'object', properties: { colour: { type: 'string' }, n: { type: 'integer' } }, required: ['colour', 'n'], additionalProperties: false },
          },
        },
      }),
    },
    { name: 'top-level cache_control', body: base({ cache_control: { type: 'ephemeral' } }) },
    { name: 'system block with cache_control', body: base({ system: [{ type: 'text', text: 'Be brief.', cache_control: { type: 'ephemeral', ttl: '1h' } }] }) },
    { name: 'anthropic-beta header (threads)', body: base({}), betas: ['message-threads-2026-08-12'] },
    { name: 'thread: create', body: base({ thread: { type: 'create' } }), betas: ['message-threads-2026-08-12'] },
    { name: 'fallbacks: default', body: base({ fallbacks: 'default' }), betas: ['server-side-fallback-2026-07-01'] },
    { name: 'context_management: clear_tool_uses', body: base({ context_management: { edits: [{ type: 'clear_tool_uses_20250919' }] } }), betas: ['context-management-2025-06-27'] },
    { name: 'metadata.user_id', body: base({ metadata: { user_id: 'job-123' } }) },
    { name: 'temperature: 0', body: base({ temperature: 0 }) },
    { name: 'stop_sequences', body: base({ messages: [{ role: 'user', content: 'Count from 1 to 10 separated by spaces.' }], stop_sequences: ['5'] }) },
    { name: 'tool strict: true', body: base({ messages: [WEATHER_ASK], tools: [{ ...WEATHER_TOOL, strict: true }] }) },
    { name: 'tool eager_input_streaming', body: base({ messages: [WEATHER_ASK], tools: [{ ...WEATHER_TOOL, eager_input_streaming: true }] }) },
    { name: 'tool_choice: auto', body: base({ messages: [WEATHER_ASK], tools: [WEATHER_TOOL], tool_choice: { type: 'auto' } }) },
    { name: 'tool_choice: any (on a no-tool question)', body: base({ tools: [WEATHER_TOOL], tool_choice: { type: 'any' } }) },
    { name: 'tool_choice: none (on a tool question)', body: base({ messages: [WEATHER_ASK], tools: [WEATHER_TOOL], tool_choice: { type: 'none' } }) },
    { name: 'tool_choice: auto + disable_parallel_tool_use', body: base({ messages: [WEATHER_ASK], tools: [WEATHER_TOOL], tool_choice: { type: 'auto', disable_parallel_tool_use: true } }) },
    {
      name: 'tool_result is_error: true',
      body: base({
        tools: [WEATHER_TOOL],
        messages: [...toolUseTurn, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', is_error: true, content: 'Service unavailable' }] }],
      }),
    },
    {
      name: 'tool_result text + image',
      body: base({
        tools: [WEATHER_TOOL],
        messages: [
          ...toolUseTurn,
          {
            role: 'user',
            content: [
              {
                type: 'tool_result',
                tool_use_id: 'toolu_1',
                content: [
                  { type: 'text', text: 'Weather service returned a picture instead. Read the code word in it.' },
                  { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png } },
                ],
              },
            ],
          },
        ],
      }),
    },
    {
      name: 'tool_result followed by text in the same user turn',
      body: base({
        tools: [WEATHER_TOOL],
        messages: [
          ...toolUseTurn,
          { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'Sunny, 21C' }, { type: 'text', text: 'Reply in French.' }] },
        ],
      }),
    },
    { name: 'image: url source', body: base({ messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'url', url: 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png' } }, { type: 'text', text: 'Describe it.' }] }] }) },
    { name: 'image: jpeg media_type on png data', body: base({ messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: png } }, { type: 'text', text: 'Read the code word.' }] }] }) },
    { name: 'mid-conversation system message', body: base({ messages: [ASK, { role: 'system', content: 'Answer in German only.' }] }) },
  ];
}

function describe(name: string, message: BetaMessage): ProbeResult {
  return {
    name,
    status: 200,
    error: null,
    stopReason: message.stop_reason,
    blockTypes: message.content.map((b: BetaContentBlock) => b.type),
    toolCalls: message.content.flatMap((b: BetaContentBlock) => (b.type === 'tool_use' ? [`${b.name}(${JSON.stringify(b.input)})`] : [])),
    text: message.content.flatMap((b: BetaContentBlock) => (b.type === 'text' ? [b.text] : [])).join(' ').slice(0, 200),
  };
}

async function run(client: Anthropic, probe: Probe): Promise<ProbeResult> {
  // The probes send fields the SDK types don't all know, which is the point; the cast only gets them past the compiler.
  const params: CreateParams = { ...probe.body, ...(probe.betas ? { betas: probe.betas } : {}) } as unknown as CreateParams;
  try {
    const message: BetaMessage = await client.beta.messages.create(params);
    return describe(probe.name, message);
  } catch (e: unknown) {
    if (e instanceof Anthropic.APIError) {
      return { name: probe.name, status: e.status ?? 0, error: e.message.slice(0, 300), stopReason: null, blockTypes: [], toolCalls: [], text: '' };
    }
    throw e;
  }
}

async function countTokens(client: Anthropic): Promise<ProbeResult> {
  try {
    const counted: Anthropic.Beta.Messages.BetaMessageTokensCount = await client.beta.messages.countTokens({ model: MODEL, messages: [{ role: 'user', content: 'Say hello in one word.' }] });
    return { name: 'POST /v1/messages/count_tokens', status: 200, error: null, stopReason: null, blockTypes: [], toolCalls: [], text: JSON.stringify(counted) };
  } catch (e: unknown) {
    if (e instanceof Anthropic.APIError) {
      return { name: 'POST /v1/messages/count_tokens', status: e.status ?? 0, error: e.message.slice(0, 300), stopReason: null, blockTypes: [], toolCalls: [], text: '' };
    }
    throw e;
  }
}

async function main(): Promise<void> {
  const canary: string = randomCanary();
  const png: string = await bannerScreenshot(canary);
  const client: Anthropic = ollamaClient();
  const results: ProbeResult[] = [];
  for (const probe of probes(png)) {
    const result: ProbeResult = await run(client, probe);
    results.push(result);
    console.log(JSON.stringify(result));
  }
  const counted: ProbeResult = await countTokens(client);
  results.push(counted);
  console.log(JSON.stringify(counted));
  console.log(`canary for the image probes: ${canary}`);
  mkdirSync('results', { recursive: true });
  writeFileSync(`results/probes-${MODEL.replace(/[:/]/g, '_')}.json`, JSON.stringify({ model: MODEL, canary, results }, null, 2));
}

void main();
