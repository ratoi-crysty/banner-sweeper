import { ownedRuleFields } from './owned-fields.js';

const URL = 'https://Shop.Example.co.uk/basket?id=1';

describe('ownedRuleFields', () => {
  it('names the Rule after the lowercased hostname', () => {
    expect(ownedRuleFields({}, { url: URL }).name).toBe(
      'bs_shop.example.co.uk',
    );
  });

  it('needs rule step version 1 for plain Steps', () => {
    expect(
      ownedRuleFields(
        {
          detectCmp: [{ exists: '#banner' }],
          optOut: [{ waitForThenClick: '#reject' }, { hide: '#banner' }],
        },
        { url: URL },
      ).minimumRuleStepVersion,
    ).toBe(1);
  });

  it.each(['removeClass', 'setStyle', 'addStyle'])(
    'needs rule step version 2 for %s',
    (action: string) => {
      expect(
        ownedRuleFields(
          { optOut: [{ [action]: 'x', selector: 'body' }] },
          { url: URL },
        ).minimumRuleStepVersion,
      ).toBe(2);
    },
  );

  it('needs rule step version 3 for stylesheet', () => {
    expect(
      ownedRuleFields(
        {
          optOut: [
            { removeClass: 'no-scroll', selector: 'body' },
            { stylesheet: 'html { overflow: auto }' },
          ],
        },
        { url: URL },
      ).minimumRuleStepVersion,
    ).toBe(3);
  });

  it('finds Steps nested in if and any, in every Step list', () => {
    expect(
      ownedRuleFields(
        {
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
      ).minimumRuleStepVersion,
    ).toBe(2);
  });

  it('ignores what is not a Step, since it runs before Validation', () => {
    expect(
      ownedRuleFields(
        { optOut: 'click reject', detectCmp: [null, 3, { then: 'x' }] },
        { url: URL },
      ),
    ).toEqual({ name: 'bs_shop.example.co.uk', minimumRuleStepVersion: 1 });
  });
});
