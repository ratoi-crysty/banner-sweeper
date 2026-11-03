import {
  CreateDetectionRequest,
  DetectionResult,
  DetectionUsage,
} from '@banner-sweeper/api-interfaces';
import { Injectable, Logger } from '@nestjs/common';
import { stackOf } from '../error-text';
import { StockCheck, StockCheckResult } from '../verification/stock-check';
import { DetectionFailure, describeFailure } from './detection-failure';

export interface DetectionRun {
  result: DetectionResult;
  usage: DetectionUsage;
}

/**
 * Decides what a Site needs: Covered by the existing Rules, or an error. Knows nothing about jobs
 * or storage, so the HTTP jobs and the test-set runner share it. Never throws: failures come back
 * as `error` results, with the stack in the logs only.
 */
@Injectable()
export class Detection {
  protected readonly logger: Logger = new Logger(Detection.name);

  constructor(protected readonly stockCheck: StockCheck) {}

  async run(request: CreateDetectionRequest): Promise<DetectionRun> {
    const startedAt: number = Date.now();
    const result: DetectionResult = await this.detect(request);

    return {
      result,
      usage: this.stockCheckUsage(Date.now() - startedAt),
    };
  }

  protected async detect(
    request: CreateDetectionRequest,
  ): Promise<DetectionResult> {
    try {
      const stock: StockCheckResult = await this.stockCheck.run(request.url);

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
      const failure: DetectionFailure = describeFailure(error);
      this.logger.error(
        `Detection of ${request.url} failed (${failure.kind})`,
        stackOf(error),
      );

      return { outcome: 'error', ...failure };
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
}
