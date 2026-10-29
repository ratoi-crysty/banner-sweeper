import { Module } from '@nestjs/common';
import { resolve } from 'node:path';
import { LlmBackendModule } from '../llm-backend/llm-backend.module';

@Module({
  imports: [
    // Relative to the workspace root, where `nx serve` runs the API.
    LlmBackendModule.register({
      configPath: resolve('apps/api/config/llm-backends.json'),
    }),
  ],
})
export class AppModule {}
