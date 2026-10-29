import { Global, Module } from '@nestjs/common';
import { API_CONFIG, apiConfigFromEnv } from './api-config';
import type { ApiConfig } from './api-config';

@Global()
@Module({
  providers: [
    {
      provide: API_CONFIG,
      useFactory: (): ApiConfig => apiConfigFromEnv(process.env),
    },
  ],
  exports: [API_CONFIG],
})
export class ConfigModule {}
