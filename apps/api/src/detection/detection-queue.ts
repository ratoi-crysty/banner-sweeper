import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
} from '@nestjs/common';
import { API_CONFIG } from '../app/api-config';
import type { ApiConfig } from '../app/api-config';
import { DetectionRunner } from './detection-runner';

/** An in-memory FIFO of job ids, run `detectionConcurrency` at a time. */
@Injectable()
export class DetectionQueue implements OnApplicationShutdown {
  private readonly logger: Logger = new Logger(DetectionQueue.name);
  private readonly waiting: string[] = [];
  private readonly running: Set<Promise<void>> = new Set<Promise<void>>();

  constructor(
    @Inject(API_CONFIG) private readonly config: ApiConfig,
    private readonly runner: DetectionRunner,
  ) {}

  enqueue(jobId: string): void {
    this.waiting.push(jobId);
    this.drain();
  }

  // Lets running jobs finish their writes before the database closes
  async onApplicationShutdown(): Promise<void> {
    this.waiting.length = 0;
    await Promise.all(this.running);
  }

  private drain(): void {
    while (
      this.running.size < this.config.detectionConcurrency &&
      this.waiting.length > 0
    ) {
      const jobId: string = this.waiting.shift() as string;
      const run: Promise<void> = this.runner
        .run(jobId)
        .catch((error: unknown): void => {
          this.logger.error(
            `Detection job ${jobId} crashed`,
            describeStack(error),
          );
        })
        .finally((): void => {
          this.running.delete(run);
          this.drain();
        });
      this.running.add(run);
    }
  }
}

function describeStack(error: unknown): string {
  return error instanceof Error
    ? (error.stack ?? error.message)
    : String(error);
}
