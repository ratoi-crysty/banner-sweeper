import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Module } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { apiConfig } from '../../../config/api.config';
import type { ApiConfig } from '../../../config/api.config';
import { DetectionJobEntity } from '../detection/detection-job.entity';

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
          // TODO: Switch to migration based synchronisation after the first deploy to production
          synchronize: true,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
