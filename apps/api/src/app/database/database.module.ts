import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Module } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { apiConfig } from '../../config/api.config';
import type { ApiConfig } from '../../config/api.config';
import { DetectionJobEntity } from '../detection/detection-job.entity';
import { CreateDetectionJobs1761696000000 } from '../detection/migrations/1761696000000-create-detection-jobs';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [apiConfig.KEY],
      useFactory: (config: ApiConfig): TypeOrmModuleOptions => {
        mkdirSync(dirname(config.databasePath), { recursive: true });

        return {
          type: 'better-sqlite3',
          database: config.databasePath,
          entities: [DetectionJobEntity],
          migrations: [CreateDetectionJobs1761696000000],
          migrationsRun: true,
          // The schema only ever changes through migrations
          synchronize: false,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
