import { firstLine } from '../error-text';

/** The browser couldn't load the requested URL. */
export class SiteUnreachableError extends Error {
  constructor(url: string, cause: unknown) {
    super(`Couldn't load ${url}: ${firstLine(cause)}`, { cause });
    this.name = 'SiteUnreachableError';
  }
}
