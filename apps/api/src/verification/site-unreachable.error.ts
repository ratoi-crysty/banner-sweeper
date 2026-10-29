import { firstLine } from '../app/first-line';

/** The browser couldn't load the requested URL. */
export class SiteUnreachableError extends Error {
  constructor(url: string, cause: unknown) {
    super(`Couldn't load ${url}: ${firstLine(cause)}`, { cause });
    this.name = 'SiteUnreachableError';
  }
}
