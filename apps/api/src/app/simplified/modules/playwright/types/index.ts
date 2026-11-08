/**
 * Playwright module types. FE-safe: plain TypeScript, no runtime imports.
 */

export type BrowserMode = 'launch' | 'connect';

export interface PlaywrightModuleOptions {
  /** 'launch' a local browser, or 'connect' to a browser server (e.g. Docker). */
  mode: BrowserMode;
  /** Required for 'connect', e.g. ws://localhost:3000/pw */
  wsEndpoint?: string;
  /** Default true. Headed mode needs a display (Xvfb in Docker). */
  headless?: boolean;
  /** e.g. 'chrome' to use installed Google Chrome. */
  channel?: string;
  /** 'launch' only: custom browser binary. */
  executablePath?: string;
  /** 'launch' only (or 'connect' with sendArgsOnConnect). Default: DEFAULT_LAUNCH_ARGS. */
  launchArgs?: string[];
  /** Send launchArgs to the server. Only honoured by `playwright run-server --unsafe`. */
  sendArgsOnConnect?: boolean;
}

/** Per-context settings. Safe to accept from the FE (e.g. "generate as a Romanian visitor"). */
export interface ContextSettings {
  locale?: string;
  timezoneId?: string;
  userAgent?: string;
  viewport?: { width: number; height: number };
}

export interface BlockInfo {
  blocked: boolean;
  reason?: string;
}

/** Removes navigator.webdriver, the most obvious automation signal. */
export const DEFAULT_LAUNCH_ARGS: readonly string[] = ['--disable-blink-features=AutomationControlled'];
