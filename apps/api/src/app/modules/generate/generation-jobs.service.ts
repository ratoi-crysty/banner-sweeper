import { Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import PQueue from 'p-queue';
import { ReplaySubject, type Observable } from 'rxjs';
import type { AgentStep } from '../agent';
import { GENERATE_OPTIONS, type GenerateModuleOptions } from './generate.constants';
import { GenerateService } from './generate.service';
import type {
  GenerateRuleRequest,
  GenerateRuleResult,
  GenerationEvent,
  GenerationJob,
  GenerationJobState,
} from './types/generate.types';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { GenerationJobEntity } from './generation-job.entity';

interface JobEntry {
  jobId: string;
  events: ReplaySubject<GenerationEvent>;
  /** Stops the generator once the job is running. */
  abort: AbortController;
  /** Removes the job from the queue while it still waits; never aborts a running job. */
  dequeue: AbortController;
}

/**
 * In-memory job queue (p-queue): generation takes minutes, so the API starts a job and streams progress.
 * Swap for a persistent queue (BullMQ etc.) if you need jobs to survive restarts.
 */
@Injectable()
export class GenerationJobsService implements OnModuleInit, OnModuleDestroy {
  protected readonly logger = new Logger(GenerationJobsService.name);
  protected readonly jobs = new Map<string, JobEntry>();
  protected readonly queue: PQueue;

  constructor(
    protected readonly generator: GenerateService,
    @Inject(GENERATE_OPTIONS) protected readonly options: GenerateModuleOptions,
    @InjectRepository(GenerationJobEntity) protected readonly repo: Repository<GenerationJobEntity>,
  ) {
    this.queue = new PQueue({ concurrency: options.maxConcurrentJobs });
  }

  async create(request: GenerateRuleRequest): Promise<GenerationJob> {
    const job = this.repo.create({
      state: 'queued',
      request,
      createdAt: new Date().toISOString(),
      steps: [],
      logs: [],
    });

    await this.repo.save(job);

    this.createEntry(job);

    return job;
  }

  async get(id: string): Promise<GenerationJob> {
    const entity: GenerationJobEntity | null = await this.repo.findOneBy({ id });

    if (!entity) {
      throw new NotFoundException();
    }

    return entity;
  }

  list(): Promise<GenerationJobEntity[]> {
    return this.repo.find();
  }

  /** Replays everything so far, then streams live; completes when the job ends. */
  events(id: string): Observable<GenerationEvent> {
    return this.entry(id).events.asObservable();
  }

  async cancel(id: string): Promise<GenerationJob> {
    const entry = this.entry(id);
    entry.abort.abort();

    const job: GenerationJob = await this.get(id);

    if (job.state === 'queued') {
      entry.dequeue.abort();
    }

    this.jobs.delete(id);

    return job;
  }

  async onModuleInit(): Promise<void> {
    const jobs = await this.repo.findBy({ state: In<GenerationJobState>(['queued', 'error']) });

    jobs.forEach((job: GenerationJobEntity) => this.createEntry(job));
  }

  onModuleDestroy(): void {
    this.queue.clear();
    for (const e of this.jobs.values()) e.abort.abort();
  }

  protected createEntry(job: GenerationJobEntity) {
    const entry: JobEntry = {
      jobId: job.id,
      events: new ReplaySubject<GenerationEvent>(),
      abort: new AbortController(),
      dequeue: new AbortController(),
    };
    this.jobs.set(job.id, entry);
    entry.events.next({ type: 'state', state: 'queued' });
    this.queue
      .add(() => this.run(entry), { signal: entry.dequeue.signal })
      .catch((err) => {
        this.logger.error(`Error while executing queue for: ${job.id}`, err);

        // Only rejects when the job was dequeued before it started; `run` handles its own errors.
        this.finish(entry, { status: 'cancelled', summary: 'Cancelled before start.', steps: [] }).catch((err) =>
          this.logger.error(`Error while trying to finish entry: ${entry.jobId}`, err),
        );
      });
  }

  protected async run(entry: JobEntry): Promise<void> {
    const job = await this.get(entry.jobId);

    job.state = 'running';
    job.startedAt = new Date().toISOString();

    await this.repo.save(job);

    entry.events.next({ type: 'state', state: 'running' });

    try {
      const result = await this.generator.generate(job.request, {
        signal: entry.abort.signal,
        onLog: (message) => {
          job.logs.push(message);
          this.repo.save(job).catch((err) => this.logger.error('Could not update job logs', err));
          entry.events.next({ type: 'log', message });
        },
        onStep: (raw) => {
          const step = withoutImage(raw);
          job.steps.push(step);
          this.repo.save(job).catch((err) => this.logger.error('Could not update job steps', err));
          entry.events.next({ type: 'step', step });
        },
      });

      await this.finish(entry, result);
    } catch (err) {
      const error = (err as Error).message;
      this.logger.error(`Job ${job.id} failed: ${error}`);
      job.state = 'error';
      job.error = error;
      job.finishedAt = new Date().toISOString();

      await this.repo.save(job);

      entry.events.next({ type: 'error', error });
      entry.events.next({ type: 'state', state: 'error' });
      entry.events.complete();

      this.jobs.delete(entry.jobId);
    }
  }

  protected async finish(entry: JobEntry, result: GenerateRuleResult): Promise<void> {
    const job = await this.get(entry.jobId);

    job.result = { ...result, steps: result.steps.map(withoutImage) };
    job.state = 'finished';
    job.finishedAt = new Date().toISOString();

    await this.repo.save(job);

    entry.events.next({ type: 'result', result: job.result });
    entry.events.next({ type: 'state', state: 'finished' });
    entry.events.complete();

    this.jobs.delete(entry.jobId);
  }

  protected entry(id: string): JobEntry {
    const entry = this.jobs.get(id);

    if (!entry) {
      throw new NotFoundException(`No generation job ${id}`);
    }

    return entry;
  }
}

/** Screenshots are big and only useful to the model; keep them out of API payloads. */
function withoutImage(step: AgentStep): AgentStep {
  if (!step.result.imageBase64) return step;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { imageBase64: _, ...result } = step.result;
  return { call: step.call, result: { ...result, text: `${result.text} [screenshot omitted]` } };
}
