import type { BrowserContextOptions } from 'playwright-core';

/** What the browser tells Sites about where the visitor is. */
export interface BrowserRegion {
  locale: string;
  timezoneId: string;
}

export const CONTEXT_VIEWPORT: BrowserContextOptions['viewport'] = {
  width: 1280,
  height: 800,
};

/**
 * Options for every context Detection opens: the configured locale and timezone, a 1280×800
 * viewport, and a normal Chrome user agent, since some Sites treat the headless one as a bot.
 */
export function contextOptions(browserVersion: string, region: BrowserRegion): BrowserContextOptions {
  return {
    locale: region.locale,
    timezoneId: region.timezoneId,
    viewport: CONTEXT_VIEWPORT,
    userAgent: chromeUserAgent(browserVersion),
  };
}

// Chrome's reduced user agent: only the major version is real
export function chromeUserAgent(browserVersion: string): string {
  const major: string = browserVersion.split('.')[0] ?? '0';

  return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;
}
