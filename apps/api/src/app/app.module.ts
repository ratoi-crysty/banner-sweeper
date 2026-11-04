import { resolve } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { apiConfig } from '../config/api.config';
import { DatabaseModule } from './modules/database/database.module';
import { DetectionModule } from './modules/detection/detection.module';
import { LlmBackendModule } from '../llm-backend/llm-backend.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [apiConfig] }),
    DatabaseModule,
    DetectionModule,
    // Relative to the workspace root, where `nx serve` runs the API.
    LlmBackendModule.register({
      configPath: resolve('apps/api/config/llm-backends.json'),
    }),
  ],
})
export class AppModule {}
