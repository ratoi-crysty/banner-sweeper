import { AutoConsentRuleStep } from '@duckduckgo/autoconsent';
import { validateCandidate } from './validate-candidate.js';
import { CandidateValidation } from './validate-rule.js';

const URL = 'https://Shop.Example.co.uk/basket?id=1';

// A Rule as the LLM writes it: without the fields our code owns
function candidate(...optOut: AutoConsentRuleStep[]): Record<string, unknown> {
  return {
    runContext: { main: true, urlPattern: '^https://shop\\.example\\.co\\.uk/' },
    detectCmp: [{ exists: '#banner' }],
    detectPopup: [{ visible: '#banner' }],
    optIn: [],
    optOut: optOut.length > 0 ? optOut : [{ waitForThenClick: '#reject' }],
  };
}

function validRule(result: CandidateValidation): Record<string, unknown> {
  if (!result.valid) {
    throw new Error(`Expected a valid Rule, got ${JSON.stringify(result.problems)}`);
  }
  return { ...result.rule };
}

describe('validateCandidate', () => {
  it('names the Rule after the lowercased hostname', () => {
    expect(validRule(validateCandidate(candidate(), { url: URL })).name).toBe('bs_shop.example.co.uk');
  });

  it('overwrites a name the candidate brings', () => {
    expect(validRule(validateCandidate({ ...candidate(), name: 'auto_other' }, { url: URL })).name).toBe(
      'bs_shop.example.co.uk',
    );
  });

  it('keeps the rest of the candidate unchanged', () => {
    expect(validRule(validateCandidate(candidate(), { url: URL }))).toEqual({
      ...candidate(),
      name: 'bs_shop.example.co.uk',
      minimumRuleStepVersion: 1,
    });
  });

  it('needs rule step version 1 for plain Steps', () => {
    expect(
      validRule(validateCandidate(candidate({ waitForThenClick: '#reject' }, { hide: '#banner' }), { url: URL }))
        .minimumRuleStepVersion,
    ).toBe(1);
  });

  it.each(['removeClass', 'setStyle', 'addStyle'])('needs rule step version 2 for %s', (action: string) => {
    expect(
      validRule(validateCandidate(candidate({ [action]: 'x', selector: 'body' }), { url: URL })).minimumRuleStepVersion,
    ).toBe(2);
  });

  it('needs rule step version 3 for stylesheet', () => {
    expect(
      validRule(
        validateCandidate(
          candidate({ removeClass: 'no-scroll', selector: 'body' }, { stylesheet: 'html { overflow: auto }' }),
          { url: URL },
        ),
      ).minimumRuleStepVersion,
    ).toBe(3);
  });

  it('finds Steps nested in if and any, in every Step list', () => {
    expect(
      validRule(
        validateCandidate(
          {
            ...candidate(),
            test: [
              {
                any: [
                  {
                    if: { exists: '#banner' },
                    then: [{ click: '#reject' }],
                    else: [{ setStyle: '', selector: 'body' }],
                  },
                ],
              },
            ],
          },
          { url: URL },
        ),
      ).minimumRuleStepVersion,
    ).toBe(2);
  });

  it('returns the problems of an invalid candidate, and no Rule', () => {
    expect(validateCandidate(candidate({ eval: 'EVAL_ONETRUST_1' }), { url: URL })).toEqual({
      valid: false,
      problems: [{ path: '$.optOut[0].eval', message: expect.any(String) }],
    });
  });

  it('returns a schema problem for what is not a Rule at all', () => {
    expect(validateCandidate({ ...candidate(), optOut: 'click reject' }, { url: URL })).toEqual({
      valid: false,
      problems: [{ path: '$.optOut', message: expect.any(String) }],
    });
    expect(validateCandidate('click reject', { url: URL })).toEqual({
      valid: false,
      problems: [{ path: '$', message: expect.any(String) }],
    });
  });
});
