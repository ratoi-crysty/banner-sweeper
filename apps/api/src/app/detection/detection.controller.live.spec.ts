import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request, { Response } from 'supertest';
import { DetectionJob, DetectionSummary } from '@banner-sweeper/api-interfaces';
import { apiConfig } from '../api-config';
import type { ApiConfig } from '../api-config';
import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';

// Needs a Playwright 1.64 browser server and the internet; see apps/api/README.md
const PLAYWRIGHT_HOST: string | undefined = process.env['PLAYWRIGHT_HOST'];

// Covered when screened: Cookiebot, Declined by the Bundled Rule (test-set/screening/results.jsonl)
const COVERED_SITE = 'https://www.unipd.it/';
// In the test set: only a cosmetic Bundled Rule (cc_banner) hides its banner (test-set/sites.json)
const COSMETIC_ONLY_SITE = 'https://www.shoprenter.hu/';

const JOB_TIMEOUT_MS = 150_000;

describe.skipIf(!PLAYWRIGHT_HOST)('Stock check on live Sites', () => {
  let app: INestApplication;
  let dataDir: string;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'detections-live-'));
    const config: ApiConfig = {
      playwrightHost: PLAYWRIGHT_HOST as string,
      databasePath: join(dataDir, 'api.sqlite'),
      detectionConcurrency: 2,
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(apiConfig.KEY)
      .useValue(config)
      .compile();
    app = moduleRef.createNestApplication({ logger: ['error', 'warn'] });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  async function detect(url: string): Promise<DetectionJob> {
    const created: Response = await request(app.getHttpServer())
      .post('/api/detections')
      .send({ url })
      .expect(202);
    const { id }: DetectionSummary = created.body;

    return vi.waitFor(
      async (): Promise<DetectionJob> => {
        const response: Response = await request(app.getHttpServer())
          .get(`/api/detections/${id}`)
          .expect(200);
        const job: DetectionJob = response.body;
        expect(job.status).toBe('finished');

        return job;
      },
      { timeout: JOB_TIMEOUT_MS, interval: 1000 },
    );
  }

  it(
    'ends Covered when the Bundled Rules Decline the banner',
    async () => {
      const job: DetectionJob = await detect(COVERED_SITE);

      expect(job).toMatchObject({
        outcome: 'covered',
        coveredBy: 'Cybotcookiebot',
        via: 'stockCheck',
        report: {
          checks: {
            detected: { status: 'passed' },
            declined: { status: 'passed' },
          },
        },
      });
      expect(job.usage).toMatchObject({ inputTokens: 0, outputTokens: 0 });
    },
    JOB_TIMEOUT_MS,
  );

  it(
    'ends as an error when a Bundled Rule only hides the banner',
    async () => {
      const job: DetectionJob = await detect(COSMETIC_ONLY_SITE);

      expect(job).toMatchObject({
        outcome: 'error',
        kind: 'internal',
        message: expect.stringContaining('cc_banner only hid the banner'),
      });
    },
    JOB_TIMEOUT_MS,
  );
});
