import { Module, ValidationPipe } from '@nestjs/common';
import { APP_PIPE } from '@nestjs/core';
import { VALIDATION_PIPE_OPTIONS } from '../common/validation';
import { AgentModule, type ProviderType } from '../modules/agent';
import { GenerateModule } from '../modules/generate';
import { PlaywrightModule } from '../modules/playwright';

const env = process.env;

/**
 * Configuration via environment:
 *   PW_WS_ENDPOINT   connect to a browser server (e.g. Docker) instead of launching one
 *   PW_HEADED=1      headed browser          PW_CHANNEL=chrome   use Google Chrome
 *   CHROME_PATH      custom browser binary (launch mode)
 *   LLM_PROVIDER     claude-agent-sdk (default) | claude-api | ollama     LLM_MODEL   model name
 *   ANTHROPIC_API_KEY, OLLAMA_HOST
 *   MAX_CONCURRENT_JOBS (default 2)
 */
@Module({
  imports: [
    PlaywrightModule.forRoot({
      mode: env.PW_WS_ENDPOINT ? 'connect' : 'launch',
      wsEndpoint: env.PW_WS_ENDPOINT,
      headless: env.PW_HEADED !== '1',
      channel: env.PW_CHANNEL || undefined,
      executablePath: env.CHROME_PATH || undefined,
    }),
    AgentModule.forRoot({
      defaultProvider: {
        type: (env.LLM_PROVIDER as ProviderType) || 'claude-agent-sdk',
        model: env.LLM_MODEL || undefined,
      },
      anthropicApiKey: env.ANTHROPIC_API_KEY,
      ollamaHost: env.OLLAMA_HOST,
    }),
    GenerateModule.register({ maxConcurrentJobs: Number(env.MAX_CONCURRENT_JOBS) || undefined }),
  ],
  providers: [
    // Validates every DTO-typed @Body()/@Query()/@Param().
    { provide: APP_PIPE, useValue: new ValidationPipe(VALIDATION_PIPE_OPTIONS) },
  ],
})
export class AppModule {}
