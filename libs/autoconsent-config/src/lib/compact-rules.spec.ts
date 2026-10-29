import { CompactCMPRuleset } from '@duckduckgo/autoconsent';
import { compactRulesForFrame } from './compact-rules.js';

// A Bundled Rule for ziptozipmoving.com that runs in the top frame only
const MAIN_FRAME_RULE = 'ziptozipmoving';
// A Bundled Rule for modellbau-berlinski.de that runs in iframes only
const IFRAME_RULE = 'auto_DE_modellbau-berlinski.de_8vm';

function ruleNames(ruleset: CompactCMPRuleset): string[] {
  return ruleset.r.map(
    (rule: CompactCMPRuleset['r'][number]): string => rule[1],
  );
}

describe('compactRulesForFrame', () => {
  it('gives a main frame the rules for its Site', () => {
    const ruleset: CompactCMPRuleset = compactRulesForFrame({
      url: 'https://www.ziptozipmoving.com/',
      mainFrame: true,
    });

    expect(ruleNames(ruleset)).toContain(MAIN_FRAME_RULE);
  });

  it("leaves out another Site's rules", () => {
    const ruleset: CompactCMPRuleset = compactRulesForFrame({
      url: 'https://example.org/',
      mainFrame: true,
    });

    expect(ruleNames(ruleset)).not.toContain(MAIN_FRAME_RULE);
  });

  it('gives an iframe the iframe rules for its Site', () => {
    const ruleset: CompactCMPRuleset = compactRulesForFrame({
      url: 'https://www.modellbau-berlinski.de/',
      mainFrame: false,
    });

    expect(ruleNames(ruleset)).toContain(IFRAME_RULE);
  });

  it('keeps main-frame-only rules out of iframes', () => {
    const ruleset: CompactCMPRuleset = compactRulesForFrame({
      url: 'https://www.ziptozipmoving.com/',
      mainFrame: false,
    });

    expect(ruleNames(ruleset)).not.toContain(MAIN_FRAME_RULE);
  });

  it('keeps iframe-only rules out of the main frame', () => {
    const ruleset: CompactCMPRuleset = compactRulesForFrame({
      url: 'https://www.modellbau-berlinski.de/',
      mainFrame: true,
    });

    expect(ruleNames(ruleset)).not.toContain(IFRAME_RULE);
  });
});
