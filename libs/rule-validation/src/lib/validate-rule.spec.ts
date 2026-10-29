import {
  AutoConsentCMPRule,
  AutoConsentRuleStep,
} from '@duckduckgo/autoconsent';
import { RuleProblem, validateRule } from './validate-rule.js';

const URL = 'https://www.example.com/en/';

function validRule(): AutoConsentCMPRule {
  return {
    name: 'bs_www.example.com',
    minimumRuleStepVersion: 1,
    prehideSelectors: ['#cookie-banner'],
    runContext: { main: true, urlPattern: '^https://www\\.example\\.com/' },
    detectCmp: [{ exists: '#cookie-banner' }],
    detectPopup: [{ visible: '#cookie-banner', check: 'any' }],
    optIn: [],
    optOut: [
      {
        if: { visible: '#cookie-banner .settings' },
        then: [{ click: '#cookie-banner .settings' }],
        else: [{ wait: 500 }],
      },
      { waitForThenClick: '#cookie-banner .reject', timeout: 3000, retry: 2 },
    ],
    test: [{ cookieContains: 'consent=rejected' }],
  };
}

function withOptOut(...optOut: AutoConsentRuleStep[]): AutoConsentCMPRule {
  return { ...validRule(), optOut };
}

function withoutField(
  field: keyof AutoConsentCMPRule,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(validRule()).filter(
      ([key]: [string, unknown]): boolean => key !== field,
    ),
  );
}

function problemPaths(rule: unknown): string[] {
  return validateRule(rule, { url: URL }).map(
    (problem: RuleProblem): string => problem.path,
  );
}

describe('validateRule', () => {
  it('passes a valid Rule', () => {
    expect(validateRule(validRule(), { url: URL })).toEqual([]);
  });

  describe('schema', () => {
    it('rejects a field autoconsent does not know', () => {
      expect(problemPaths({ ...validRule(), colour: 'red' })).toEqual([
        '$.colour',
      ]);
    });

    it('rejects a Step field autoconsent does not know', () => {
      expect(
        problemPaths({
          ...validRule(),
          optOut: [{ click: '#reject', force: true }],
        }),
      ).toEqual(['$.optOut[0].force']);
    });

    it('rejects a missing required field', () => {
      expect(problemPaths(withoutField('detectPopup'))).toEqual([
        '$.detectPopup',
      ]);
    });

    it('rejects a field of the wrong type', () => {
      expect(
        problemPaths({ ...validRule(), optOut: [{ wait: '500' }] }),
      ).toEqual(['$.optOut[0].wait']);
    });

    it('reports a malformed selector once', () => {
      expect(
        validateRule({ ...validRule(), optOut: [{ click: 5 }] }, { url: URL }),
      ).toEqual([
        {
          path: '$.optOut[0].click',
          message: expect.stringContaining('selector'),
        },
      ]);
    });

    it('rejects an eval that is not a bundled snippet as eval', () => {
      expect(
        validateRule(
          { ...validRule(), optOut: [{ eval: 'document.cookie' }] },
          { url: URL },
        ),
      ).toEqual([
        {
          path: '$.optOut[0].eval',
          message: expect.stringContaining('not allowed'),
        },
      ]);
    });

    it('rejects something that is not a Rule at all', () => {
      expect(problemPaths('click the reject button')).toEqual(['$']);
    });
  });

  describe('fields our code owns', () => {
    it('rejects a name other than bs_<site>', () => {
      expect(problemPaths({ ...validRule(), name: 'bs_example.com' })).toEqual([
        '$.name',
      ]);
    });

    it('lowercases the hostname for the name', () => {
      expect(
        validateRule(validRule(), { url: 'https://WWW.Example.COM/en/' }),
      ).toEqual([]);
    });

    it('rejects the auto_ prefix', () => {
      expect(
        validateRule(
          { ...validRule(), name: 'auto_www.example.com' },
          { url: URL },
        ),
      ).toContainEqual({
        path: '$.name',
        message: expect.stringContaining('auto_'),
      });
    });

    it('rejects a name that collides with a Bundled Rule', () => {
      expect(
        validateRule({ ...validRule(), name: 'ziptozipmoving' }, { url: URL }),
      ).toContainEqual({
        path: '$.name',
        message: expect.stringContaining('Bundled Rule'),
      });
    });

    it('rejects a name that collides with a hard-coded CMP', () => {
      expect(
        validateRule({ ...validRule(), name: 'Onetrust' }, { url: URL }),
      ).toContainEqual({
        path: '$.name',
        message: expect.stringContaining('hard-coded CMP'),
      });
    });

    it('rejects a missing minimumRuleStepVersion', () => {
      expect(problemPaths(withoutField('minimumRuleStepVersion'))).toEqual([
        '$.minimumRuleStepVersion',
      ]);
    });

    it('rejects a minimumRuleStepVersion lower than the Steps need', () => {
      expect(
        problemPaths(
          withOptOut({ addStyle: 'overflow: auto', selector: 'body' }),
        ),
      ).toEqual(['$.minimumRuleStepVersion']);
    });

    it('rejects a minimumRuleStepVersion higher than the Steps need', () => {
      expect(
        problemPaths({ ...validRule(), minimumRuleStepVersion: 3 }),
      ).toEqual(['$.minimumRuleStepVersion']);
    });

    it('rejects _metadata', () => {
      expect(
        problemPaths({ ...validRule(), _metadata: { vendorUrl: 'https://x' } }),
      ).toEqual(['$._metadata']);
    });

    it('rejects vendorUrl', () => {
      expect(
        problemPaths({ ...validRule(), vendorUrl: 'https://www.example.com/' }),
      ).toEqual(['$.vendorUrl']);
    });
  });

  describe('rejected features', () => {
    it('rejects eval', () => {
      expect(
        problemPaths(withOptOut({ eval: 'EVAL_ONETRUST_1' }, { click: '#x' })),
      ).toEqual(['$.optOut[0].eval']);
    });

    it('rejects eval nested in an if', () => {
      expect(
        problemPaths(
          withOptOut({
            if: { exists: '#banner' },
            then: [{ eval: 'EVAL_ONETRUST_1' }],
          }),
        ),
      ).toEqual(['$.optOut[0].then[0].eval']);
    });

    it('rejects an optIn other than []', () => {
      expect(
        problemPaths({ ...validRule(), optIn: [{ click: '#accept' }] }),
      ).toEqual(['$.optIn']);
    });

    it('rejects openCmp', () => {
      expect(
        problemPaths({ ...validRule(), openCmp: [{ click: '#settings' }] }),
      ).toEqual(['$.openCmp']);
    });

    it('rejects intermediate: true', () => {
      expect(problemPaths({ ...validRule(), intermediate: true })).toEqual([
        '$.intermediate',
      ]);
    });

    it('allows intermediate: false', () => {
      expect(problemPaths({ ...validRule(), intermediate: false })).toEqual([]);
    });

    it('rejects runContext.frame: true', () => {
      expect(
        problemPaths({
          ...validRule(),
          runContext: { ...validRule().runContext, frame: true },
        }),
      ).toEqual(['$.runContext.frame']);
    });

    it('rejects cosmetic: true, pointing to report_no_refusal', () => {
      expect(
        validateRule({ ...validRule(), cosmetic: true }, { url: URL }),
      ).toEqual([
        {
          path: '$.cosmetic',
          message: expect.stringContaining('report_no_refusal'),
        },
      ]);
    });
  });

  describe('Step shape', () => {
    it('rejects a Step without an action', () => {
      expect(problemPaths(withOptOut({ optional: true }))).toEqual([
        '$.optOut[0]',
      ]);
    });

    it('rejects a Step with two actions', () => {
      expect(
        problemPaths(withOptOut({ click: '#reject', hide: '#banner' })),
      ).toEqual(['$.optOut[0]']);
    });

    // autoconsent skips these actions when their value is falsy, leaving an "Unrecognized rule"
    it.each<[string, AutoConsentRuleStep]>([
      ['wait', { wait: 0 }],
      ['click', { click: '' }],
      ['hide', { hide: '' }],
      ['cookieContains', { cookieContains: '' }],
    ])('rejects an empty %s', (action, step) => {
      expect(problemPaths(withOptOut(step))).toEqual([`$.optOut[0].${action}`]);
    });

    it('allows an empty setStyle, which clears the inline style', () => {
      expect(
        problemPaths({
          ...withOptOut({ setStyle: '', selector: 'body' }),
          minimumRuleStepVersion: 2,
        }),
      ).toEqual([]);
    });

    it('allows optional, comment and negated on any Step', () => {
      expect(
        problemPaths(
          withOptOut(
            { exists: '#banner', negated: true, comment: 'gone already?' },
            { click: '#reject', optional: true },
          ),
        ),
      ).toEqual([]);
    });

    it.each<[string, AutoConsentRuleStep]>([
      ['timeout', { click: '#reject', timeout: 1000 }],
      ['all', { waitFor: '#reject', all: true }],
      ['check', { exists: '#banner', check: 'all' }],
      ['method', { click: '#reject', method: 'opacity' }],
      ['retry', { click: '#reject', retry: 1 }],
      ['retryInterval', { waitFor: '#reject', retryInterval: 100 }],
      ['then', { exists: '#banner', then: [{ click: '#reject' }] }],
      ['else', { exists: '#banner', else: [{ click: '#reject' }] }],
      ['selector', { click: '#reject', selector: 'body' }],
      ['stylesheetId', { hide: '#banner', stylesheetId: 'bs' }],
    ])('rejects %s on an action it does not belong to', (modifier, step) => {
      expect(problemPaths(withOptOut(step))).toEqual([
        `$.optOut[0].${modifier}`,
      ]);
    });

    it.each(['removeClass', 'setStyle', 'addStyle'])(
      'rejects %s without a selector',
      (action: string) => {
        expect(
          problemPaths({
            ...validRule(),
            minimumRuleStepVersion: 2,
            optOut: [{ [action]: 'x' }],
          }),
        ).toEqual(['$.optOut[0]']);
      },
    );

    it('rejects an if without a condition', () => {
      expect(
        problemPaths(withOptOut({ if: {}, then: [{ click: '#reject' }] })),
      ).toEqual(['$.optOut[0].if']);
    });

    it('rejects an if with two conditions', () => {
      expect(
        problemPaths(
          withOptOut({
            if: { exists: '#banner', visible: '#banner' },
            then: [{ click: '#reject' }],
          }),
        ),
      ).toEqual(['$.optOut[0].if']);
    });

    it('rejects check on an if that tests exists', () => {
      expect(
        problemPaths(
          withOptOut({
            if: { exists: '#banner', check: 'all' },
            then: [{ click: '#reject' }],
          }),
        ),
      ).toEqual(['$.optOut[0].if.check']);
    });

    it('rejects an if without then', () => {
      expect(problemPaths(withOptOut({ if: { exists: '#banner' } }))).toEqual([
        '$.optOut[0]',
      ]);
    });

    it.each(['detectCmp', 'detectPopup', 'optOut'])(
      'rejects an empty %s',
      (list: string) => {
        expect(problemPaths({ ...validRule(), [list]: [] })).toEqual([
          `$.${list}`,
        ]);
      },
    );

    it('rejects an empty test', () => {
      expect(problemPaths({ ...validRule(), test: [] })).toEqual(['$.test']);
    });

    it('allows leaving test out', () => {
      expect(problemPaths(withoutField('test'))).toEqual([]);
    });
  });

  describe('caps', () => {
    // detectCmp, detectPopup and test each hold one Step
    const OTHER_STEPS = 3;

    function clicks(count: number): AutoConsentRuleStep[] {
      return Array.from(
        { length: count },
        (_: unknown, index: number): AutoConsentRuleStep => ({
          click: `#button-${index}`,
        }),
      );
    }

    function nestedAny(levels: number): AutoConsentRuleStep {
      return levels === 0
        ? { click: '#reject' }
        : { any: [nestedAny(levels - 1)] };
    }

    it('allows a wait of 5000 ms', () => {
      expect(problemPaths(withOptOut({ wait: 5000 }))).toEqual([]);
    });

    it('rejects a wait over 5000 ms', () => {
      expect(problemPaths(withOptOut({ wait: 5001 }))).toEqual([
        '$.optOut[0].wait',
      ]);
    });

    it('allows a timeout of 10000 ms', () => {
      expect(
        problemPaths(withOptOut({ waitFor: '#reject', timeout: 10000 })),
      ).toEqual([]);
    });

    it('rejects a timeout over 10000 ms', () => {
      expect(
        problemPaths(withOptOut({ waitFor: '#reject', timeout: 10001 })),
      ).toEqual(['$.optOut[0].timeout']);
    });

    it('allows 5 retries', () => {
      expect(
        problemPaths(withOptOut({ waitForThenClick: '#reject', retry: 5 })),
      ).toEqual([]);
    });

    it('rejects more than 5 retries', () => {
      expect(
        problemPaths(withOptOut({ waitForThenClick: '#reject', retry: 6 })),
      ).toEqual(['$.optOut[0].retry']);
    });

    it('allows if/any nested 3 deep', () => {
      expect(problemPaths(withOptOut(nestedAny(3)))).toEqual([]);
    });

    it('rejects if/any nested deeper than 3', () => {
      expect(
        problemPaths(
          withOptOut({
            if: { exists: '#banner' },
            then: [nestedAny(3)],
          }),
        ),
      ).toEqual(['$.optOut[0].then[0].any[0].any[0]']);
    });

    it('allows 40 Steps', () => {
      expect(problemPaths(withOptOut(...clicks(40 - OTHER_STEPS)))).toEqual([]);
    });

    it('rejects more than 40 Steps', () => {
      expect(problemPaths(withOptOut(...clicks(41 - OTHER_STEPS)))).toEqual([
        '$',
      ]);
    });

    it('allows a selector of 500 characters', () => {
      expect(
        problemPaths(withOptOut({ click: `#${'a'.repeat(499)}` })),
      ).toEqual([]);
    });

    it.each<[string, AutoConsentCMPRule]>([
      ['$.optOut[0].click', withOptOut({ click: `#${'a'.repeat(500)}` })],
      [
        '$.optOut[0].waitForThenClick[1]',
        withOptOut({ waitForThenClick: ['#host', `#${'a'.repeat(500)}`] }),
      ],
      [
        '$.optOut[0].if.visible',
        withOptOut({
          if: { visible: `#${'a'.repeat(500)}` },
          then: [{ click: '#reject' }],
        }),
      ],
      ['$.optOut[0].hide', withOptOut({ hide: `#${'a'.repeat(500)}` })],
      [
        '$.optOut[0].selector',
        {
          ...withOptOut({ removeClass: 'x', selector: `#${'a'.repeat(500)}` }),
          minimumRuleStepVersion: 2,
        },
      ],
      [
        '$.prehideSelectors[0]',
        { ...validRule(), prehideSelectors: [`#${'a'.repeat(500)}`] },
      ],
    ])('rejects a selector over 500 characters at %s', (path, rule) => {
      expect(problemPaths(rule)).toEqual([path]);
    });

    it('allows a Rule of 16 KB serialized', () => {
      // Adding `,"comment":"…"` grows the JSON by 13 characters plus the comment
      const size: number = JSON.stringify(validRule()).length + 13;
      expect(
        problemPaths({ ...validRule(), comment: 'a'.repeat(16 * 1024 - size) }),
      ).toEqual([]);
    });

    it('rejects a Rule over 16 KB serialized', () => {
      expect(
        problemPaths({ ...validRule(), comment: 'a'.repeat(16 * 1024) }),
      ).toEqual(['$']);
    });

    it('counts the serialized size in bytes', () => {
      expect(
        problemPaths({ ...validRule(), comment: '€'.repeat(6 * 1024) }),
      ).toEqual(['$']);
    });
  });
});
