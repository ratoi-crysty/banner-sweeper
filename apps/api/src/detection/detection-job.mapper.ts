import {
  DetectionJob,
  DetectionResult,
  DetectionSummary,
  DetectionUsage,
} from '@banner-sweeper/api-interfaces';
import { DetectionJobEntity } from './detection-job.entity';

export function toDetectionSummary(
  entity: DetectionJobEntity,
): DetectionSummary {
  return {
    id: entity.id,
    url: entity.url,
    status: entity.status,
    outcome: entity.outcome,
    createdAt: entity.createdAt.toISOString(),
    startedAt: entity.startedAt?.toISOString() ?? null,
    finishedAt: entity.finishedAt?.toISOString() ?? null,
  };
}

export function toDetectionJob(entity: DetectionJobEntity): DetectionJob {
  return {
    id: entity.id,
    url: entity.url,
    site: entity.site,
    hint: entity.hint,
    status: entity.status,
    phase: entity.phase,
    createdAt: entity.createdAt.toISOString(),
    startedAt: entity.startedAt?.toISOString() ?? null,
    finishedAt: entity.finishedAt?.toISOString() ?? null,
    usage: toUsage(entity),
    result: entity.result
      ? (JSON.parse(entity.result) as DetectionResult)
      : null,
  };
}

function toUsage(entity: DetectionJobEntity): DetectionUsage | null {
  if (entity.usageDurationMs === null) {
    return null;
  }

  return {
    backend: entity.usageBackend,
    model: entity.usageModel,
    effort: entity.usageEffort,
    promptVersion: entity.usagePromptVersion,
    turns: entity.usageTurns ?? 0,
    inputTokens: entity.usageInputTokens ?? 0,
    outputTokens: entity.usageOutputTokens ?? 0,
    cacheReadTokens: entity.usageCacheReadTokens ?? 0,
    cacheWriteTokens: entity.usageCacheWriteTokens ?? 0,
    costUsd: entity.usageCostUsd,
    durationMs: entity.usageDurationMs,
  };
}

/** The `usage*` columns for a job's usage. */
export function usageColumns(
  usage: DetectionUsage,
): Pick<
  DetectionJobEntity,
  | 'usageBackend'
  | 'usageModel'
  | 'usageEffort'
  | 'usagePromptVersion'
  | 'usageTurns'
  | 'usageInputTokens'
  | 'usageOutputTokens'
  | 'usageCacheReadTokens'
  | 'usageCacheWriteTokens'
  | 'usageCostUsd'
  | 'usageDurationMs'
> {
  return {
    usageBackend: usage.backend,
    usageModel: usage.model,
    usageEffort: usage.effort,
    usagePromptVersion: usage.promptVersion,
    usageTurns: usage.turns,
    usageInputTokens: usage.inputTokens,
    usageOutputTokens: usage.outputTokens,
    usageCacheReadTokens: usage.cacheReadTokens,
    usageCacheWriteTokens: usage.cacheWriteTokens,
    usageCostUsd: usage.costUsd,
    usageDurationMs: usage.durationMs,
  };
}
