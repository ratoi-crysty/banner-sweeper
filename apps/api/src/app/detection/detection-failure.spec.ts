import { BrowserUnavailableError } from '../browser/browser-unavailable.error';
import { SiteUnreachableError } from '../verification/site-unreachable.error';
import { DetectionFailure, describeFailure } from './detection-failure';

describe('describeFailure', () => {
  it('reports a Site the browser could not load as unreachable', () => {
    const failure: DetectionFailure = describeFailure(
      new SiteUnreachableError(
        'https://nowhere.invalid/',
        new Error(
          'page.goto: net::ERR_NAME_NOT_RESOLVED at https://nowhere.invalid/\nCall log:\n  - navigating to "https://nowhere.invalid/"',
        ),
      ),
    );

    expect(failure).toEqual({
      kind: 'siteUnreachable',
      message:
        "Couldn't load https://nowhere.invalid/: page.goto: net::ERR_NAME_NOT_RESOLVED at https://nowhere.invalid/",
    });
  });

  it('reports a browser server that is down as unavailable', () => {
    const failure: DetectionFailure = describeFailure(
      new BrowserUnavailableError(
        new Error(
          'browserType.connect: connect ECONNREFUSED 127.0.0.1:8080\nCall log:\n  - <ws connecting> ws://localhost:8080/',
        ),
      ),
    );

    expect(failure).toEqual({
      kind: 'browserUnavailable',
      message:
        'The browser is unavailable: browserType.connect: connect ECONNREFUSED 127.0.0.1:8080',
    });
  });

  it('reports anything else as internal, without its stack', () => {
    const error: Error = new TypeError(
      "Cannot read properties of undefined (reading 'cmp')",
    );

    const failure: DetectionFailure = describeFailure(error);

    expect(failure).toEqual({
      kind: 'internal',
      message: "Cannot read properties of undefined (reading 'cmp')",
    });
    expect(failure.message).not.toContain('at ');
  });

  it('reports a thrown non-error as internal', () => {
    expect(describeFailure('boom')).toEqual({
      kind: 'internal',
      message: 'boom',
    });
  });
});
