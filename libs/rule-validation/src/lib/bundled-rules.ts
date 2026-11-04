import { CompactCMPRuleset, IndexedCMPRuleset } from '@duckduckgo/autoconsent';
import compactRules from '@duckduckgo/autoconsent/rules/compact-rules.json' with { type: 'json' };

// A JSON import is typed by its literal shape, which TypeScript can't match to the ruleset's tuple types
const ruleset: CompactCMPRuleset = compactRules as IndexedCMPRuleset;

/** The names of the Bundled Rules in the pinned autoconsent. */
export const BUNDLED_RULE_NAMES: ReadonlySet<string> = new Set(
  ruleset.r.map((rule: CompactCMPRuleset['r'][number]): string => rule[1]),
);
