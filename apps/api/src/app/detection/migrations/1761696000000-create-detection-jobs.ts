import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDetectionJobs1761696000000 implements MigrationInterface {
  name = 'CreateDetectionJobs1761696000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "detection_jobs" (
        "id" varchar PRIMARY KEY NOT NULL,
        "url" text NOT NULL,
        "site" text NOT NULL,
        "hint" text,
        "status" text NOT NULL,
        "phase" text,
        "outcome" text,
        "errorKind" text,
        "createdAt" datetime NOT NULL,
        "startedAt" datetime,
        "finishedAt" datetime,
        "usageBackend" text,
        "usageModel" text,
        "usageEffort" text,
        "usagePromptVersion" text,
        "usageTurns" integer,
        "usageInputTokens" integer,
        "usageOutputTokens" integer,
        "usageCacheReadTokens" integer,
        "usageCacheWriteTokens" integer,
        "usageCostUsd" real,
        "usageDurationMs" integer,
        "result" text,
        "trace" text
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_detection_jobs_createdAt" ON "detection_jobs" ("createdAt")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_detection_jobs_createdAt"`);
    await queryRunner.query(`DROP TABLE "detection_jobs"`);
  }
}
