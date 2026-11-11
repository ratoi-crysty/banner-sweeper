import { join } from 'node:path';
import { languageTag, positiveInteger, timeZone } from './utils/config.utils';
import { registerAs } from '@nestjs/config';

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
const DEFAULT_BROWSER_LOCALE = 'en-GB';
const DEFAULT_BROWSER_TIMEZONE = 'Europe/Bucharest';

export const apiConfig = registerAs(
  'api',
  (): ApiConfig => ({
    playwrightHost: process.env['PLAYWRIGHT_HOST'] || DEFAULT_PLAYWRIGHT_HOST,
    databasePath: process.env['DATABASE_PATH'] || DEFAULT_DATABASE_PATH,
    detectionConcurrency: positiveInteger(
      'DETECTION_CONCURRENCY',
      process.env['DETECTION_CONCURRENCY'],
      DEFAULT_DETECTION_CONCURRENCY,
    ),
    browserLocale: languageTag('BROWSER_LOCALE', process.env['BROWSER_LOCALE'], DEFAULT_BROWSER_LOCALE),
    browserTimezone: timeZone('BROWSER_TIMEZONE', process.env['BROWSER_TIMEZONE'], DEFAULT_BROWSER_TIMEZONE),
  }),
);
