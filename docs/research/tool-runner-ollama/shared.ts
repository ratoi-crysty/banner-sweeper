import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { chromium, Browser, Page } from 'playwright-core';

export const OLLAMA_BASE_URL: string = process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434';
export const MODEL: string = process.env['SPIKE_MODEL'] ?? 'gemma4:e4b-it-qat';

/** One request the SDK sent, as the server saw it. */
export interface WireRecord {
  path: string;
  anthropicBeta: string | null;
  stainlessHelper: string | null;
  bodyKeys: string[];
  messageCount: number;
  firstMessageRole: string | null;
  hasSystem: boolean;
  toolCount: number;
  thread: unknown;
  status: number;
  responseSnippet: string;
}

export const wireLog: WireRecord[] = [];

interface RequestBody {
  messages?: Array<{ role?: string }>;
  system?: unknown;
  tools?: unknown[];
  thread?: unknown;
  [key: string]: unknown;
}

function headerValue(init: RequestInit | undefined, name: string): string | null {
  const headers: Headers = new Headers(init?.headers);
  return headers.get(name);
}

/** A fetch that records what goes over the wire, so the spike sees exactly what the SDK sends. */
async function loggingFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const url: URL = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  const body: RequestBody = typeof init?.body === 'string' ? (JSON.parse(init.body) as RequestBody) : {};
  const response: Response = await fetch(input, init);
  const isStream: boolean = response.headers.get('content-type')?.includes('event-stream') ?? false;
  const snippet: string = isStream ? '<event-stream>' : (await response.clone().text()).slice(0, 600);
  wireLog.push({
    path: url.pathname,
    anthropicBeta: headerValue(init, 'anthropic-beta'),
    stainlessHelper: headerValue(init, 'x-stainless-helper'),
    bodyKeys: Object.keys(body).sort(),
    messageCount: body.messages?.length ?? 0,
    firstMessageRole: body.messages?.[0]?.role ?? null,
    hasSystem: body.system !== undefined,
    toolCount: body.tools?.length ?? 0,
    thread: body.thread ?? null,
    status: response.status,
    responseSnippet: snippet,
  });
  return response;
}

export function ollamaClient(): Anthropic {
  return new Anthropic({ baseURL: OLLAMA_BASE_URL, apiKey: 'ollama', fetch: loggingFetch, maxRetries: 0 });
}

/** `PLAYWRIGHT_HOST` from the environment, else from the repo's `.env.local` (run from the repo root or pass ENV_FILE). */
function playwrightHost(): string {
  const fromEnv: string | undefined = process.env['PLAYWRIGHT_HOST'];
  if (fromEnv) return fromEnv;
  const envFile: string = readFileSync(process.env['ENV_FILE'] ?? '../../../.env.local', 'utf8');
  const line: string | undefined = envFile.split('\n').find((l: string) => l.startsWith('PLAYWRIGHT_HOST='));
  if (!line) throw new Error('PLAYWRIGHT_HOST missing from .env.local');
  return line.slice('PLAYWRIGHT_HOST='.length).trim().replace(/^["']|["']$/g, '');
}

const WORDS: string[] = ['MAPLE', 'COBALT', 'TUNDRA', 'SAFFRON', 'GRANITE', 'ORCHID', 'LANTERN', 'QUARTZ'];

export function randomCanary(): string {
  const word: string = WORDS[Math.floor(Math.random() * WORDS.length)] ?? 'MAPLE';
  return `${word}-${1000 + Math.floor(Math.random() * 9000)}`;
}

/**
 * A 1280x800 PNG of a fake consent banner whose code word and button labels exist only in the pixels,
 * taken on the same remote browser Detection uses.
 */
export async function bannerScreenshot(canary: string): Promise<string> {
  const browser: Browser = await chromium.connect(playwrightHost());
  try {
    const page: Page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.setContent(`
      <body style="margin:0;font-family:sans-serif;background:#f4f4f4">
        <h1 style="padding:40px">Daily News</h1>
        <div style="position:fixed;bottom:0;left:0;right:0;background:#1d2b44;color:white;padding:32px">
          <p style="font-size:22px">We value your privacy. Code word: <b>${canary}</b></p>
          <button style="font-size:20px;padding:10px 24px">Accept all</button>
          <button style="font-size:20px;padding:10px 24px">Reject all</button>
          <button style="font-size:20px;padding:10px 24px">Manage options</button>
        </div>
      </body>`);
    const png: Buffer = await page.screenshot();
    return png.toString('base64');
  } finally {
    await browser.close();
  }
}
