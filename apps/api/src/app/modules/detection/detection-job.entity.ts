import type {
  DetectionErrorKind,
  DetectionOutcome,
  DetectionPhase,
  DetectionStatus,
} from '@banner-sweeper/api-interfaces';
import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * A Detection job as stored: the envelope in columns, `usage` flattened into `usage*` columns,
 * and the result and trace as JSON text. `toDetectionJob` turns it into the API's `DetectionJob`.
 * Unlike the usual entity, it doesn't implement the shared model or carry Swagger decorators: its
 * storage shape differs from the API's, which `DetectionEnvelopeDto` documents.
 */
@Entity('detection_jobs')
export class DetectionJobEntity {
  @PrimaryColumn('varchar')
  id!: string;

  @Column('text')
  url!: string;

  @Column('text')
  site!: string;

  @Column('text', { nullable: true })
  hint!: string | null;

  @Column('text')
  status!: DetectionStatus;

  @Column('text', { nullable: true })
  phase!: DetectionPhase | null;

  @Column('text', { nullable: true })
  outcome!: DetectionOutcome | null;

  @Column('text', { nullable: true })
  errorKind!: DetectionErrorKind | null;

  @Column('datetime')
  createdAt!: Date;

  @Column('datetime', { nullable: true })
  startedAt!: Date | null;

  @Column('datetime', { nullable: true })
  finishedAt!: Date | null;

  @Column('text', { nullable: true })
  usageBackend!: string | null;

  @Column('text', { nullable: true })
  usageModel!: string | null;

  @Column('text', { nullable: true })
  usageEffort!: string | null;

  @Column('text', { nullable: true })
  usagePromptVersion!: string | null;

  @Column('integer', { nullable: true })
  usageTurns!: number | null;

  @Column('integer', { nullable: true })
  usageInputTokens!: number | null;

  @Column('integer', { nullable: true })
  usageOutputTokens!: number | null;

  @Column('integer', { nullable: true })
  usageCacheReadTokens!: number | null;

  @Column('integer', { nullable: true })
  usageCacheWriteTokens!: number | null;

  @Column('real', { nullable: true })
  usageCostUsd!: number | null;

  @Column('integer', { nullable: true })
  usageDurationMs!: number | null;

  // JSON of the `DetectionResult`
  @Column('text', { nullable: true })
  result!: string | null;

  // JSON of the agent's trace, once there is one
  @Column('text', { nullable: true })
  trace!: string | null;
}
