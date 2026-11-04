import { AddressInfo, Server, Socket, createServer } from 'node:net';
import type { ApiConfig } from '../../../config/api.config';
import { BrowserUnavailableError } from './browser-unavailable.error';
import { BrowserService } from './browser.service';

/**
 * Stands in for a browser server that's down: it accepts each connection, records the WebSocket
 * upgrade request the client opens with, then drops it.
 */
class DroppingServer {
  attempts = 0;
  readonly requests: string[] = [];
  protected readonly server: Server;

  constructor(dropAfterMs: number) {
    this.server = createServer((socket: Socket): void => {
      this.attempts++;
      socket.once('data', (chunk: Buffer): void => {
        this.requests.push(chunk.toString());
      });
      setTimeout((): void => {
        socket.destroy();
      }, dropAfterMs);
    });
  }

  async start(): Promise<string> {
    await new Promise<void>((resolve: () => void): void => {
      this.server.listen(0, '127.0.0.1', resolve);
    });
    const { port }: AddressInfo = this.server.address() as AddressInfo; // listening on TCP, so never a pipe name

    return `ws://127.0.0.1:${port}/`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve: () => void): void => {
      this.server.close((): void => resolve());
    });
  }
}

function configFor(playwrightHost: string): ApiConfig {
  return {
    playwrightHost,
    databasePath: ':memory:',
    detectionConcurrency: 1,
    browserLocale: 'en-GB',
    browserTimezone: 'Europe/Bucharest',
  };
}

describe('BrowserService, with the browser server down', () => {
  let server: DroppingServer;
  let browser: BrowserService;

  beforeEach(async () => {
    server = new DroppingServer(50);
    browser = new BrowserService(configFor(await server.start()));
  });

  afterEach(async () => {
    await browser.onApplicationShutdown();
    await server.stop();
  });

  it('reports it as BrowserUnavailableError', async () => {
    await expect(browser.newContext()).rejects.toBeInstanceOf(BrowserUnavailableError);
  });

  it('asks the browser server for full Chromium, not the headless shell', async () => {
    await expect(browser.newContext()).rejects.toThrow();

    expect(server.requests).toHaveLength(1);
    expect(server.requests[0]).toMatch(/^x-playwright-launch-options: {"channel":"chromium"}\r$/im);
  });

  it('shares one connection attempt between callers at the same time', async () => {
    const results: PromiseSettledResult<unknown>[] = await Promise.allSettled([
      browser.newContext(),
      browser.newContext(),
    ]);

    expect(results.map((result: PromiseSettledResult<unknown>): string => result.status)).toEqual([
      'rejected',
      'rejected',
    ]);
    expect(server.attempts).toBe(1);
  });

  it('tries again after a failed connection instead of failing every later call', async () => {
    await expect(browser.newContext()).rejects.toThrow();
    await expect(browser.newContext()).rejects.toThrow();

    expect(server.attempts).toBe(2);
  });

  it('shuts down cleanly when it never connected', async () => {
    await expect(browser.onApplicationShutdown()).resolves.toBeUndefined();
  });

  it('shuts down cleanly while a connection attempt is failing', async () => {
    const context: Promise<unknown> = browser.newContext();

    await expect(browser.onApplicationShutdown()).resolves.toBeUndefined();
    await expect(context).rejects.toBeInstanceOf(BrowserUnavailableError);
  });
});
