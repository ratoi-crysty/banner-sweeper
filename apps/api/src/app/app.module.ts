import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ApiConfig, apiConfig } from '../config/api.config';
import { DatabaseModule } from './modules/database/database.module';
import { GenerateModule } from './modules/generate';
import { PlaywrightModule } from './modules/playwright';
import { AgentModule } from './modules/agent';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [apiConfig] }),
    DatabaseModule,
    PlaywrightModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiConfig>) => ({
        mode: config.get('playwrightHost') ? 'connect' : 'launch',
        wsEndpoint: config.get('playwrightHost'),
      })
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
