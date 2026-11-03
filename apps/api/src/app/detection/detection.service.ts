import { randomUUID } from 'node:crypto';
import {
  CreateDetectionRequest,
  DetectionJob,
  DetectionSummary,
} from '@banner-sweeper/api-interfaces';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DetectionJobEntity } from './detection-job.entity';
import { toDetectionJob, toDetectionSummary } from './detection-job.mapper';
import { DetectionQueue } from './detection-queue';

/** Detection jobs as the API sees them; how a job is stored stays in here. */
@Injectable()
export class DetectionService {
  constructor(
    @InjectRepository(DetectionJobEntity)
    protected readonly jobs: Repository<DetectionJobEntity>,
    protected readonly queue: DetectionQueue,
  ) {}

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
    this.queue.enqueue(job.id);

    return toDetectionSummary(job);
  }

  async get(id: string): Promise<DetectionJob | undefined> {
    const job: DetectionJobEntity | undefined =
      (await this.jobs.findOneBy({ id })) ?? undefined;

    return job ? toDetectionJob(job) : undefined;
  }
}
