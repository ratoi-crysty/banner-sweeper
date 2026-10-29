import { ErrorResult } from '@banner-sweeper/api-interfaces';
import { firstLine } from '../error-text';
import { BrowserUnavailableError } from '../browser/browser-unavailable.error';
import { SiteUnreachableError } from '../verification/site-unreachable.error';

export type DetectionFailure = Pick<ErrorResult, 'kind' | 'message'>;

/** What a job reports for an error. The message never carries a stack trace; those go to logs only. */
export function describeFailure(error: unknown): DetectionFailure {
  if (error instanceof SiteUnreachableError) {
    return { kind: 'siteUnreachable', message: error.message };
  }

  if (error instanceof BrowserUnavailableError) {
    return { kind: 'browserUnavailable', message: error.message };
  }

  return { kind: 'internal', message: firstLine(error) };
}
