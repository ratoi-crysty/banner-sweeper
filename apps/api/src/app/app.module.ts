import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { apiConfig, ApiConfig } from './core/config/api-config';
import { DatabaseModule } from './core/database/database.module';
import { GenerateModule } from './modules/generate';
import { PlaywrightModule } from './modules/playwright';
import { AgentModule } from './modules/agent';

@Module({
  imports: [
    ConfigModule.forRoot<ApiConfig>({ isGlobal: true, load: [apiConfig] }),
    DatabaseModule,
    PlaywrightModule.forRootAsync({
      inject: [apiConfig.KEY],
      useFactory: (config: ApiConfig) => {
        return {
          mode: config.playwrightHost ? 'connect' : 'launch',
          wsEndpoint: config.playwrightHost,
        };
      },
    }),
    AgentModule.forRoot({
      defaultProvider: {
        type: 'claude-agent-sdk',
      },
    }),
    GenerateModule.register({ maxConcurrentJobs: 1 }),
  ],
})
export class AppModule {}
