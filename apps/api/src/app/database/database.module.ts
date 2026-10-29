import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Module } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { API_CONFIG, ApiConfig } from '../api-config';
import { DetectionJobEntity } from '../detection/detection-job.entity';
import { CreateDetectionJobs1761696000000 } from '../detection/migrations/1761696000000-create-detection-jobs';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [API_CONFIG],
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
