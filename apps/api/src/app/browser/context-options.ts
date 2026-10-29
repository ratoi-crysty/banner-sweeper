import type { BrowserContextOptions } from 'playwright-core';

// The test set was captured with this locale and timezone, from an EU exit
export const CONTEXT_LOCALE = 'en-GB';
export const CONTEXT_TIMEZONE = 'Europe/Bucharest';
export const CONTEXT_VIEWPORT: BrowserContextOptions['viewport'] = {
  width: 1280,
  height: 800,
};

/**
 * Options for every context Detection opens: an EU locale and timezone, a 1280×800 viewport, and
 * a normal Chrome user agent, since some Sites treat the headless one as a bot.
 */
export function contextOptions(browserVersion: string): BrowserContextOptions {
  return {
    locale: CONTEXT_LOCALE,
    timezoneId: CONTEXT_TIMEZONE,
    viewport: CONTEXT_VIEWPORT,
    userAgent: chromeUserAgent(browserVersion),
  };
}

// Chrome's reduced user agent: only the major version is real
export function chromeUserAgent(browserVersion: string): string {
  const major: string = browserVersion.split('.')[0] ?? '0';

  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}
