import {
  DetectionResult,
  DetectionUsage,
} from '@banner-sweeper/api-interfaces';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockCheck, StockCheckResult } from '../verification/stock-check';
import { DetectionFailure, describeFailure } from './detection-failure';
import { DetectionJobEntity } from './detection-job.entity';
import { usageColumns } from './detection-job.mapper';

/** Runs one Detection job through its phases and stores the outcome. */
@Injectable()
export class DetectionRunner {
  private readonly logger: Logger = new Logger(DetectionRunner.name);

  constructor(
    @InjectRepository(DetectionJobEntity)
    private readonly jobs: Repository<DetectionJobEntity>,
    private readonly stockCheck: StockCheck,
  ) {}

  async run(jobId: string): Promise<void> {
    const job: DetectionJobEntity | null = await this.jobs.findOneBy({
      id: jobId,
    });

    if (!job) {
      return;
    }

    const startedAt: Date = new Date();
    await this.jobs.update(jobId, {
      status: 'running',
      phase: 'stockCheck',
      startedAt,
    });

    const result: DetectionResult = await this.detect(job);
    const finishedAt: Date = new Date();
    await this.jobs.update(jobId, {
      status: 'finished',
      phase: null,
      finishedAt,
      outcome: result.outcome,
      errorKind: result.outcome === 'error' ? result.kind : null,
      result: JSON.stringify(result),
      ...usageColumns(
        stockCheckUsage(finishedAt.getTime() - startedAt.getTime()),
      ),
    });
  }

  private async detect(job: DetectionJobEntity): Promise<DetectionResult> {
    try {
      const stock: StockCheckResult = await this.stockCheck.run(job.url);

      if (stock.coveredBy) {
        return {
          outcome: 'covered',
          coveredBy: stock.coveredBy,
          report: stock.report,
          via: 'stockCheck',
        };
      }

      // Until the agent exists, a Site that isn't Covered has nowhere else to go
      return {
        outcome: 'error',
        kind: 'internal',
        message: `Not Covered: ${stock.notCoveredReason}. Detection can't write a Rule yet.`,
      };
    } catch (error: unknown) {
      const failure: DetectionFailure = describeFailure(error);
      this.logger.error(
        `Detection job ${job.id} failed (${failure.kind})`,
        error instanceof Error ? error.stack : String(error),
      );

      return { outcome: 'error', ...failure };
    }
  }
}

// The stock check runs no LLM, so a job that ends there used no tokens
function stockCheckUsage(durationMs: number): DetectionUsage {
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
