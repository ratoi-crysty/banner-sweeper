import { randomUUID } from 'node:crypto';
import { CreateDetectionRequest } from '@banner-sweeper/api-interfaces';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DetectionJobEntity } from './detection-job.entity';
import { DetectionQueue } from './detection-queue';

@Injectable()
export class DetectionService {
  constructor(
    @InjectRepository(DetectionJobEntity)
    protected readonly jobs: Repository<DetectionJobEntity>,
    protected readonly queue: DetectionQueue,
  ) {}

  async create(request: CreateDetectionRequest): Promise<DetectionJobEntity> {
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

    return job;
  }

  findOne(id: string): Promise<DetectionJobEntity | null> {
    return this.jobs.findOneBy({ id });
  }
}
