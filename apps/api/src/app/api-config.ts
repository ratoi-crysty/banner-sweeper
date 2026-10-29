import { join } from 'node:path';

export const API_CONFIG: unique symbol = Symbol('API_CONFIG');

export interface ApiConfig {
  // WebSocket endpoint of the Playwright browser server
  playwrightHost: string;
  databasePath: string;
  // How many Detection jobs run at once
  detectionConcurrency: number;
}

const DEFAULT_PLAYWRIGHT_HOST = 'ws://localhost:8080/';
const DEFAULT_DATABASE_PATH: string = join('apps', 'api', 'data', 'api.sqlite');
const DEFAULT_DETECTION_CONCURRENCY = 1;

export function apiConfigFromEnv(env: NodeJS.ProcessEnv): ApiConfig {
  return {
    playwrightHost: env['PLAYWRIGHT_HOST'] || DEFAULT_PLAYWRIGHT_HOST,
    databasePath: env['DATABASE_PATH'] || DEFAULT_DATABASE_PATH,
    detectionConcurrency: positiveInteger(
      'DETECTION_CONCURRENCY',
      env['DETECTION_CONCURRENCY'],
      DEFAULT_DETECTION_CONCURRENCY,
    ),
  };
}

function positiveInteger(
  name: string,
  value: string | undefined,
  fallback: number,
): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer, got "${value}"`);
  }

  return parsed;
}
