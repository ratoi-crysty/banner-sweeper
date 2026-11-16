import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Module } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { apiConfig, ApiConfig } from '../config/api-config';
import { GenerationJobEntity } from '../../modules/generate/generation-job.entity';
import { NullToUndefinedSubscriber } from './null-to-undefined.subscriber';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [apiConfig.KEY],
      useFactory: (config: ApiConfig): TypeOrmModuleOptions => {
        mkdirSync(dirname(config.databasePath), { recursive: true });

        return {
          type: 'better-sqlite3',
          database: config.databasePath,
          entities: [GenerationJobEntity],
          subscribers: [NullToUndefinedSubscriber],
          // TODO: Re-enable this when re-adding DB models
          // The schema only ever changes through migrations
          migrations: [],
          migrationsRun: false,
          synchronize: true,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
