import { DetectionBackend } from '@banner-sweeper/llm-backend';
import { DynamicModule, Module } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { selectBackendEntry } from './backend-config';
import { createDetectionBackend } from './create-detection-backend';

/** Injection token of the active `DetectionBackend`. */
export const DETECTION_BACKEND = 'DETECTION_BACKEND';

export interface LlmBackendModuleOptions {
  /** The backend config, `apps/api/config/llm-backends.json` in the app. */
  configPath: string;
}

/**
 * Validates the backend config at boot and provides the backend that `DETECTION_BACKEND` names (default
 * `claude-opus`) under the `DETECTION_BACKEND` token. A request can't choose another.
 */
@Module({})
export class LlmBackendModule {
  static register(options: LlmBackendModuleOptions): DynamicModule {
    return {
      module: LlmBackendModule,
      providers: [
        {
          provide: DETECTION_BACKEND,
          useFactory: (): DetectionBackend =>
            createDetectionBackend(
              selectBackendEntry(
                JSON.parse(readFileSync(options.configPath, 'utf8')),
                process.env['DETECTION_BACKEND'],
              ),
              process.env,
            ),
        },
      ],
      exports: [DETECTION_BACKEND],
    };
  }
}
