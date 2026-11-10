import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Module } from '@nestjs/common';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { apiConfig } from '../../../config/api.config';
import type { ApiConfig } from '../../../config/api.config';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [apiConfig.KEY],
      useFactory: (config: ApiConfig): TypeOrmModuleOptions => {
        mkdirSync(dirname(config.databasePath), { recursive: true });

        return {
          type: 'better-sqlite3',
          database: config.databasePath,
          entities: [],
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
