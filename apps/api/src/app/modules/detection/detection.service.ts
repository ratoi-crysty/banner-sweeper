import { randomUUID } from 'node:crypto';
import {
  CreateDetectionRequest,
  DetectionErrorKind,
  DetectionJob,
  DetectionResult,
  DetectionSummary,
  DetectionUsage,
  ErrorResult,
} from '@banner-sweeper/api-interfaces';
import { Inject, Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import PQueue from 'p-queue';
import { DetectionJobEntity } from './detection-job.entity';
import { toDetectionJob, toDetectionSummary, usageColumns } from './detection-job.mapper';
import { type ApiConfig, apiConfig } from '../../../config/api.config';
import { StockCheck, StockCheckResult } from '../verification/stock-check';
import { firstLine, stackOf } from '../../shared/error-utils/error-text';
import { SiteUnreachableError } from '../verification/site-unreachable.error';
import { BrowserUnavailableError } from '../browser/browser-unavailable.error';

/** Detection jobs as the API sees them; how a job is stored stays in here. */
@Injectable()
export class DetectionService implements OnApplicationBootstrap, OnApplicationShutdown {
  protected readonly queue: PQueue;
  protected readonly logger: Logger = new Logger(DetectionService.name);
  // Aborts on shutdown: running Detections stop, and their jobs go back to the queue
  protected readonly shutdown: AbortController = new AbortController();

  constructor(
    @InjectRepository(DetectionJobEntity)
    protected readonly jobs: Repository<DetectionJobEntity>,
    protected readonly stockCheck: StockCheck,
    @Inject(apiConfig.KEY) protected readonly config: ApiConfig,
  ) {
    this.queue = new PQueue({ concurrency: this.config.detectionConcurrency });
  }

  /** Picks up the jobs a previous run left unfinished, oldest first. */
  async onApplicationBootstrap(): Promise<void> {
    // Only a crash or a hard stop leaves a job running; nothing will finish it, so run it again
    await this.jobs.update({ status: 'running' }, { status: 'queued', phase: null, startedAt: null });
    const queued: DetectionJobEntity[] = await this.jobs
      .createQueryBuilder('job')
      .where('job.status = :status', { status: 'queued' })
      // `rowid` follows insertion, so it orders jobs created in the same millisecond
      .orderBy('job.createdAt', 'ASC')
      .addOrderBy('job.rowid', 'ASC')
      .getMany();

    queued.forEach((job: DetectionJobEntity): void => this.enqueue(job.id));
  }

  /**
   * Leaves the waiting jobs queued in the database, cancels the running ones and puts them back,
   * so the next start resumes all of them.
   */
  async onApplicationShutdown(): Promise<void> {
    this.queue.clear();
    this.shutdown.abort();

    await this.queue.onIdle();
  }

  async create(request: CreateDetectionRequest): Promise<DetectionSummary> {
    const job: DetectionJobEntity = this.jobs.create({
      id: randomUUID(),
      url: request.url,
      site: new URL(request.url).hostname,
      hint: request.hint ?? null,
      status: 'queued',
      phase: null,
      outcome: null,
      errorKind: null,
      createdAt: new Date(),
      startedAt: null,
      finishedAt: null,
      result: null,
      trace: null,
    });
    await this.jobs.insert(job);
    this.enqueue(job.id);

    return toDetectionSummary(job);
  }

  async get(id: string): Promise<DetectionJob | undefined> {
    const job: DetectionJobEntity | undefined = (await this.jobs.findOneBy({ id })) ?? undefined;

    return job ? toDetectionJob(job) : undefined;
  }

  // Fire and forget: the queue runs the job once a slot is free
  protected enqueue(jobId: string): void {
    void this.queue
      .add((): Promise<void> => this.detect(jobId))
      .catch((err: unknown): void => {
        // Shutdown cleared it before it started; it stays queued in the database for the next start
        if (err instanceof DOMException && err.name === 'AbortError') {
          return;
        }

        this.logger.error(`Detection job ${jobId} crashed: ${firstLine(err)}`, stackOf(err));
      });
  }

  protected async detect(jobId: string): Promise<void> {
    const job: DetectionJobEntity | undefined = (await this.jobs.findOneBy({ id: jobId })) ?? undefined;

    if (!job) {
      return;
    }

    await this.jobs.update(jobId, {
      status: 'running',
      phase: 'stockCheck',
      startedAt: new Date(),
    });

    const startedAt: number = Date.now();

    const result: DetectionResult = await this.runDetection({
      url: job.url,
      hint: job.hint ?? undefined,
    });

    if (this.shutdown.signal.aborted) {
      // Cancelled by shutdown, so the result means nothing: put the job back as never picked
      await this.jobs.update(jobId, {
        status: 'queued',
        phase: null,
        startedAt: null,
      });

      return;
    }

    await this.jobs.update(jobId, {
      status: 'finished',
      phase: null,
      finishedAt: new Date(),
      outcome: result.outcome,
      errorKind: result.outcome === 'error' ? result.kind : null,
      result: JSON.stringify(result),
      ...usageColumns(this.stockCheckUsage(Date.now() - startedAt)),
    });
  }

  protected async runDetection(request: CreateDetectionRequest): Promise<DetectionResult> {
    try {
      const stock: StockCheckResult = await this.stockCheck.run(request.url, this.shutdown.signal);

      if (stock.covered) {
        return {
          outcome: 'covered',
          coveredBy: stock.coveredBy,
          report: stock.report,
          via: 'stockCheck',
        };
      }

      // Until the agent exists, a Site that isn't Covered has nowhere else to go. There's no fitting
      // error kind for that, so it reports `internal` until the agent ticket replaces this branch.
      return {
        outcome: 'error',
        kind: 'internal',
        message: `Not Covered: ${stock.notCoveredReason}. Detection can't write a Rule yet.`,
      };
    } catch (error: unknown) {
      const failure: ErrorResult = this.describeFailure(error);

      // A cancelled stock check fails as it stops; that's no failure of the Site's
      if (!this.shutdown.signal.aborted) {
        this.logger.error(`Detection of ${request.url} failed (${failure.kind})`, stackOf(error));
      }

      return failure;
    }
  }

  // The stock check runs no LLM, so a Detection that ends there used no tokens
  protected stockCheckUsage(durationMs: number): DetectionUsage {
    return {
      backend: null,
      model: null,
      effort: null,
      promptVersion: null,
      turns: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      costUsd: null,
      durationMs,
    };
  }

  protected describeFailure(error: unknown): ErrorResult {
    let kind: DetectionErrorKind;

    if (error instanceof SiteUnreachableError) {
      kind = 'siteUnreachable';
    } else if (error instanceof BrowserUnavailableError) {
      kind = 'browserUnavailable';
    } else {
      kind = 'internal';
    }

    return { outcome: 'error', kind, message: firstLine(error) };
  }
}
