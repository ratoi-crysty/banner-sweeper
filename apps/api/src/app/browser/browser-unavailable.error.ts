import { firstLine } from '../error-text';

/** The Playwright browser server can't be reached, or dropped the connection. */
export class BrowserUnavailableError extends Error {
  constructor(cause: unknown) {
    super(`The browser is unavailable: ${firstLine(cause)}`, { cause });
    this.name = 'BrowserUnavailableError';
  }
}
