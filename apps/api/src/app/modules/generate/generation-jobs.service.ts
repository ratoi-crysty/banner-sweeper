import { Inject, Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import PQueue from 'p-queue';
import { ReplaySubject, type Observable } from 'rxjs';
import type { AgentStep } from '../agent';
import { GENERATE_OPTIONS, type GenerateModuleOptions } from './generate.constants';
import { GenerateService } from './generate.service';
import type { GenerateRuleRequest, GenerateRuleResult, GenerationEvent, GenerationJob } from './types';

interface JobEntry {
  job: GenerationJob;
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
export class GenerationJobsService implements OnModuleDestroy {
  private readonly logger = new Logger(GenerationJobsService.name);
  private readonly jobs = new Map<string, JobEntry>();
  private readonly queue: PQueue;

  constructor(
    private readonly generator: GenerateService,
    @Inject(GENERATE_OPTIONS) private readonly options: GenerateModuleOptions,
  ) {
    this.queue = new PQueue({ concurrency: options.maxConcurrentJobs });
  }

  create(request: GenerateRuleRequest): GenerationJob {
    this.evictOld();
    const job: GenerationJob = { id: randomUUID(), state: 'queued', request, createdAt: new Date().toISOString(), steps: [], logs: [] };
    const entry: JobEntry = {
      job,
      events: new ReplaySubject<GenerationEvent>(),
      abort: new AbortController(),
      dequeue: new AbortController(),
    };
    this.jobs.set(job.id, entry);
    entry.events.next({ type: 'state', state: 'queued' });
    this.queue.add(() => this.run(entry), { signal: entry.dequeue.signal }).catch(() => {
      // Only rejects when the job was dequeued before it started; `run` handles its own errors.
      this.finish(entry, { status: 'cancelled', summary: 'Cancelled before start.', steps: [] });
    });
    return job;
  }

  get(id: string): GenerationJob {
    return this.entry(id).job;
  }

  list(): GenerationJob[] {
    return [...this.jobs.values()].map((e) => e.job).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Replays everything so far, then streams live; completes when the job ends. */
  events(id: string): Observable<GenerationEvent> {
    return this.entry(id).events.asObservable();
  }

  cancel(id: string): GenerationJob {
    const entry = this.entry(id);
    entry.abort.abort();
    if (entry.job.state === 'queued') entry.dequeue.abort();
    return entry.job;
  }

  onModuleDestroy(): void {
    this.queue.clear();
    for (const e of this.jobs.values()) e.abort.abort();
  }

  private async run(entry: JobEntry): Promise<void> {
    const { job, events } = entry;
    job.state = 'running';
    job.startedAt = new Date().toISOString();
    events.next({ type: 'state', state: 'running' });
    try {
      const result = await this.generator.generate(job.request, {
        signal: entry.abort.signal,
        onLog: (message) => {
          job.logs.push(message);
          events.next({ type: 'log', message });
        },
        onStep: (raw) => {
          const step = withoutImage(raw);
          job.steps.push(step);
          events.next({ type: 'step', step });
        },
      });
      this.finish(entry, result);
    } catch (err) {
      const error = (err as Error).message;
      this.logger.error(`Job ${job.id} failed: ${error}`);
      job.state = 'error';
      job.error = error;
      job.finishedAt = new Date().toISOString();
      events.next({ type: 'error', error });
      events.next({ type: 'state', state: 'error' });
      events.complete();
    }
  }

  private finish(entry: JobEntry, result: GenerateRuleResult): void {
    const { job, events } = entry;
    job.result = { ...result, steps: result.steps.map(withoutImage) };
    job.state = 'finished';
    job.finishedAt = new Date().toISOString();
    events.next({ type: 'result', result: job.result });
    events.next({ type: 'state', state: 'finished' });
    events.complete();
  }

  private entry(id: string): JobEntry {
    const entry = this.jobs.get(id);
    if (!entry) throw new NotFoundException(`No generation job ${id}`);
    return entry;
  }

  /** Keep memory bounded: drop the oldest finished jobs beyond the limit. */
  private evictOld(): void {
    const done = [...this.jobs.values()].filter((e) => e.job.state === 'finished' || e.job.state === 'error');
    for (const e of done.slice(0, Math.max(0, done.length - this.options.keepFinishedJobs))) this.jobs.delete(e.job.id);
  }
}

/** Screenshots are big and only useful to the model; keep them out of API payloads. */
function withoutImage(step: AgentStep): AgentStep {
  if (!step.result.imageBase64) return step;
  const { imageBase64, ...result } = step.result;
  return { call: step.call, result: { ...result, text: `${result.text} [screenshot omitted]` } };
}
