import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import Database from 'better-sqlite3';
import request, { Response } from 'supertest';
import {
  DetectionJob,
  DetectionSummary,
  VerificationReport,
} from '@banner-sweeper/api-interfaces';
import { apiConfig } from '../../../config/api.config';
import type { ApiConfig } from '../../../config/api.config';
import { AppModule } from '../../app.module';
import { configureApp } from '../../configure-app';
import { SiteUnreachableError } from '../verification/site-unreachable.error';
import { StockCheck, StockCheckResult } from '../verification/stock-check';

/**
 * A stock check whose runs the test finishes by hand, in the order they started. Like the real
 * one, a run stops when the app shuts down.
 */
class FakeStockCheck extends StockCheck {
  readonly runs: PendingRun[] = [];

  run(url: string, signal: AbortSignal): Promise<StockCheckResult> {
    return new Promise<StockCheckResult>(
      (
        resolve: (result: StockCheckResult) => void,
        reject: (error: unknown) => void,
      ): void => {
        if (signal.aborted) {
          reject(signal.reason);

          return;
        }

        signal.addEventListener('abort', (): void => reject(signal.reason), {
          once: true,
        });
        this.runs.push({ url, resolve, reject });
      },
    );
  }
}

interface PendingRun {
  url: string;
  resolve: (result: StockCheckResult) => void;
  reject: (error: unknown) => void;
}

const REPORT: VerificationReport = {
  checks: {
    detected: { status: 'passed', reason: 'popupFound: Onetrust' },
    declined: { status: 'passed', reason: 'Onetrust opted out' },
  },
  timings: { totalMs: 4200, detectedMs: 1500, declinedMs: 3900 },
  messageLog: [],
  popupFrameUrl: 'https://www.example.org/',
};

const COVERED: StockCheckResult = {
  covered: true,
  coveredBy: 'Onetrust',
  report: REPORT,
};

describe('Detection jobs over HTTP', () => {
  let app: INestApplication;
  let dataDir: string;
  let stockCheck: FakeStockCheck;

  beforeEach(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'detections-api-'));
    await startApp();
  });

  afterEach(async () => {
    await app.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  // Starts the API on the test's database, with a fresh fake stock check
  async function startApp(): Promise<void> {
    stockCheck = new FakeStockCheck();
    const config: ApiConfig = {
      playwrightHost: 'ws://playwright.invalid:1/',
      databasePath: join(dataDir, 'api.sqlite'),
      detectionConcurrency: 1,
      browserLocale: 'en-GB',
      browserTimezone: 'Europe/Bucharest',
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(apiConfig.KEY)
      .useValue(config)
      .overrideProvider(StockCheck)
      .useValue(stockCheck)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
  }

  it('accepts a Detection and points to the job', async () => {
    const response: Response = await request(app.getHttpServer())
      .post('/api/detections')
      .send({ url: 'https://www.Example.org/path?q=1' })
      .expect(202);

    const summary: DetectionSummary = response.body;
    expect(summary).toEqual({
      id: expect.any(String),
      url: 'https://www.Example.org/path?q=1',
      status: 'queued',
      outcome: null,
      createdAt: expect.any(String),
      startedAt: null,
      finishedAt: null,
    });
    expect(response.headers['location']).toBe(`/api/detections/${summary.id}`);
  });

  async function createJob(body: object): Promise<string> {
    const response: Response = await request(app.getHttpServer())
      .post('/api/detections')
      .send(body)
      .expect(202);

    return (response.body as DetectionSummary).id;
  }

  async function getJob(id: string): Promise<DetectionJob> {
    const response: Response = await request(app.getHttpServer())
      .get(`/api/detections/${id}`)
      .expect(200);

    return response.body;
  }

  async function waitForJob(
    id: string,
    done: (job: DetectionJob) => boolean,
  ): Promise<DetectionJob> {
    return vi.waitFor(async (): Promise<DetectionJob> => {
      const job: DetectionJob = await getJob(id);
      expect(done(job)).toBe(true);

      return job;
    });
  }

  it('shows the job running the stock check, then Covered', async () => {
    const id: string = await createJob({
      url: 'https://www.example.org/news',
      hint: 'The banner shows after a few seconds',
    });

    const running: DetectionJob = await waitForJob(
      id,
      (job: DetectionJob): boolean => job.status === 'running',
    );
    expect(running).toMatchObject({
      id,
      url: 'https://www.example.org/news',
      site: 'www.example.org',
      hint: 'The banner shows after a few seconds',
      status: 'running',
      phase: 'stockCheck',
      startedAt: expect.any(String),
      finishedAt: null,
      usage: null,
      outcome: null,
    });
    expect(stockCheck.runs.map((run: PendingRun): string => run.url)).toEqual([
      'https://www.example.org/news',
    ]);

    stockCheck.runs[0]?.resolve(COVERED);
    const finished: DetectionJob = await waitForJob(
      id,
      (job: DetectionJob): boolean => job.status === 'finished',
    );

    expect(finished).toMatchObject({
      status: 'finished',
      phase: null,
      finishedAt: expect.any(String),
      outcome: 'covered',
      coveredBy: 'Onetrust',
      report: REPORT,
      via: 'stockCheck',
      usage: {
        turns: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        durationMs: expect.any(Number),
      },
    });
  });

  it("ends as an error when the stock Rules don't Decline the banner", async () => {
    const id: string = await createJob({ url: 'https://www.example.org/' });
    await vi.waitFor((): void => expect(stockCheck.runs).toHaveLength(1));

    stockCheck.runs[0]?.resolve({
      covered: false,
      notCoveredReason: 'cc_banner only hid the banner (a cosmetic Rule)',
      report: REPORT,
    });
    const finished: DetectionJob = await waitForJob(
      id,
      (job: DetectionJob): boolean => job.status === 'finished',
    );

    expect(finished).toMatchObject({
      outcome: 'error',
      kind: 'internal',
      message: expect.stringContaining(
        'Not Covered: cc_banner only hid the banner (a cosmetic Rule)',
      ),
    });
    expect(finished.usage).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });

  it('reports a Site the browser could not load', async () => {
    const id: string = await createJob({ url: 'https://nowhere.invalid/' });
    await vi.waitFor((): void => expect(stockCheck.runs).toHaveLength(1));

    stockCheck.runs[0]?.reject(
      new SiteUnreachableError(
        'https://nowhere.invalid/',
        new Error('page.goto: net::ERR_NAME_NOT_RESOLVED\nCall log: …'),
      ),
    );
    const finished: DetectionJob = await waitForJob(
      id,
      (job: DetectionJob): boolean => job.status === 'finished',
    );

    expect(finished).toMatchObject({
      outcome: 'error',
      kind: 'siteUnreachable',
      message:
        "Couldn't load https://nowhere.invalid/: page.goto: net::ERR_NAME_NOT_RESOLVED",
    });
  });

  it('runs jobs one at a time, first in first out', async () => {
    const first: string = await createJob({ url: 'https://one.example/' });
    const second: string = await createJob({ url: 'https://two.example/' });
    await vi.waitFor((): void => expect(stockCheck.runs).toHaveLength(1));

    expect((await getJob(second)).status).toBe('queued');

    stockCheck.runs[0]?.resolve(COVERED);
    await waitForJob(
      first,
      (job: DetectionJob): boolean => job.status === 'finished',
    );
    await vi.waitFor((): void => expect(stockCheck.runs).toHaveLength(2));

    expect(stockCheck.runs.map((run: PendingRun): string => run.url)).toEqual([
      'https://one.example/',
      'https://two.example/',
    ]);
    expect((await getJob(second)).status).toBe('running');
  });

  it('puts unfinished jobs back on shutdown and resumes them in order on start', async () => {
    const first: string = await createJob({ url: 'https://one.example/' });
    const second: string = await createJob({ url: 'https://two.example/' });
    await waitForJob(
      first,
      (job: DetectionJob): boolean => job.status === 'running',
    );

    // The first job's stock check never ends by itself, so the restart can only finish by cancelling it
    await app.close();
    await startApp();

    await vi.waitFor((): void => expect(stockCheck.runs).toHaveLength(1));
    expect(stockCheck.runs[0]?.url).toBe('https://one.example/');
    expect(await getJob(first)).toMatchObject({
      status: 'running',
      outcome: null,
    });
    expect((await getJob(second)).status).toBe('queued');

    stockCheck.runs[0]?.resolve(COVERED);
    await waitForJob(
      first,
      (job: DetectionJob): boolean => job.status === 'finished',
    );
    await vi.waitFor((): void => expect(stockCheck.runs).toHaveLength(2));
    expect(stockCheck.runs[1]?.url).toBe('https://two.example/');
  });

  it('runs a job again when the API stopped without shutting down', async () => {
    const id: string = await createJob({ url: 'https://crash.example/' });
    await waitForJob(
      id,
      (job: DetectionJob): boolean => job.status === 'running',
    );
    await app.close();

    // What a crash leaves behind: the job still marked as running, with nothing to finish it
    const database: Database.Database = new Database(
      join(dataDir, 'api.sqlite'),
    );
    database
      .prepare(
        `UPDATE detection_jobs SET status = 'running', phase = 'stockCheck' WHERE id = ?`,
      )
      .run(id);
    database.close();

    await startApp();

    await vi.waitFor((): void => expect(stockCheck.runs).toHaveLength(1));
    expect(stockCheck.runs[0]?.url).toBe('https://crash.example/');
  });

  it.each([
    ['a relative URL', { url: '/news' }],
    ['a non-http URL', { url: 'ftp://example.org/' }],
    ['a javascript: URL', { url: 'javascript:alert(1)' }],
    ['a missing URL', {}],
    [
      'a URL over 2048 characters',
      { url: `https://example.org/${'a'.repeat(2029)}` },
    ],
    [
      'a Hint over 2000 characters',
      { url: 'https://example.org/', hint: 'a'.repeat(2001) },
    ],
    [
      'an unknown field',
      { url: 'https://example.org/', model: 'claude-opus-5-5' },
    ],
  ])('rejects %s', async (_case: string, body: object) => {
    await request(app.getHttpServer())
      .post('/api/detections')
      .send(body)
      .expect(400);

    expect(stockCheck.runs).toHaveLength(0);
  });

  it('accepts a URL of 2048 characters and a Hint of 2000', async () => {
    const url = `https://example.org/${'a'.repeat(2028)}`;

    const id: string = await createJob({ url, hint: 'h'.repeat(2000) });

    expect(url).toHaveLength(2048);
    expect((await getJob(id)).url).toBe(url);
  });

  it('answers 404 for an unknown job', async () => {
    await request(app.getHttpServer())
      .get('/api/detections/0b0b6d9e-5d3c-4c55-9d6f-2b1d1e1f2a3b')
      .expect(404);
  });
});
