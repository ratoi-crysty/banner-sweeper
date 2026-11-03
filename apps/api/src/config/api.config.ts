import { join } from 'node:path';
import {
  ConfigFactory,
  ConfigFactoryKeyHost,
  registerAs,
} from '@nestjs/config';

export interface ApiConfig {
  // WebSocket endpoint of the Playwright browser server
  playwrightHost: string;
  databasePath: string;
  // How many Detection jobs run at once
  detectionConcurrency: number;
  // What the browser tells Sites about where the visitor is; match them to where the browser
  // server's traffic exits, since Sites mostly pick the banner by IP
  browserLocale: string;
  browserTimezone: string;
}

const DEFAULT_PLAYWRIGHT_HOST = 'ws://localhost:8080/';
const DEFAULT_DATABASE_PATH: string = join('apps', 'api', 'data', 'api.sqlite');
const DEFAULT_DETECTION_CONCURRENCY = 1;
// The test set was captured with these, from an EU exit
const DEFAULT_BROWSER_LOCALE = 'en-GB';
const DEFAULT_BROWSER_TIMEZONE = 'Europe/Bucharest';

console.log('DEFAULT_DATABASE_PATH', DEFAULT_DATABASE_PATH);

// Inject with `@Inject(apiConfig.KEY)`; ConfigModule.forRoot loads `.env` into process.env first
export const apiConfig: ConfigFactory<ApiConfig> &
  ConfigFactoryKeyHost<ApiConfig> = registerAs(
  'api',
  (): ApiConfig => apiConfigFromEnv(process.env),
);

export function apiConfigFromEnv(env: NodeJS.ProcessEnv): ApiConfig {
  return {
    playwrightHost: env['PLAYWRIGHT_HOST'] || DEFAULT_PLAYWRIGHT_HOST,
    databasePath: env['DATABASE_PATH'] || DEFAULT_DATABASE_PATH,
    detectionConcurrency: positiveInteger(
      'DETECTION_CONCURRENCY',
      env['DETECTION_CONCURRENCY'],
      DEFAULT_DETECTION_CONCURRENCY,
    ),
    browserLocale: languageTag(
      'BROWSER_LOCALE',
      env['BROWSER_LOCALE'],
      DEFAULT_BROWSER_LOCALE,
    ),
    browserTimezone: timeZone(
      'BROWSER_TIMEZONE',
      env['BROWSER_TIMEZONE'],
      DEFAULT_BROWSER_TIMEZONE,
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

function languageTag(
  name: string,
  value: string | undefined,
  fallback: string,
): string {
  if (!value) {
    return fallback;
  }

  // A well-formed tag isn't enough: "english" parses, but no locale data backs it
  let supported: string[] = [];

  try {
    supported = Intl.DateTimeFormat.supportedLocalesOf(value);
  } catch {
    // Malformed, like "en_GB"
  }

  if (supported.length === 0) {
    throw new Error(
      `${name} must be a supported locale such as "en-GB", got "${value}"`,
    );
  }

  return value;
}

// Returns the canonical IANA name, so a differently cased value still reaches the browser correctly
function timeZone(
  name: string,
  value: string | undefined,
  fallback: string,
): string {
  if (!value) {
    return fallback;
  }

  try {
    return new Intl.DateTimeFormat('en', { timeZone: value }).resolvedOptions()
      .timeZone;
  } catch {
    throw new Error(
      `${name} must be an IANA time zone such as "Europe/Bucharest", got "${value}"`,
    );
  }
}
