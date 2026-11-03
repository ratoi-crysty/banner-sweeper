import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Detection, DetectionRun } from './detection';
import { DetectionJobEntity } from './detection-job.entity';
import { usageColumns } from './detection-job.mapper';

/** Runs one Detection job: marks it running, runs the Detection, and stores the outcome. */
@Injectable()
export class DetectionRunner {
  constructor(
    @InjectRepository(DetectionJobEntity)
    protected readonly jobs: Repository<DetectionJobEntity>,
    protected readonly detection: Detection,
  ) {}

  async run(jobId: string): Promise<void> {
    const job: DetectionJobEntity | undefined =
      (await this.jobs.findOneBy({ id: jobId })) ?? undefined;

    if (!job) {
      return;
    }

    await this.jobs.update(jobId, {
      status: 'running',
      phase: 'stockCheck',
      startedAt: new Date(),
    });

    const { result, usage }: DetectionRun = await this.detection.run({
      url: job.url,
      hint: job.hint ?? undefined,
    });
    await this.jobs.update(jobId, {
      status: 'finished',
      phase: null,
      finishedAt: new Date(),
      outcome: result.outcome,
      errorKind: result.outcome === 'error' ? result.kind : null,
      result: JSON.stringify(result),
      ...usageColumns(usage),
    });
  }
}
