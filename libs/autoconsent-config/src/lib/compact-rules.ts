import {
  CompactCMPRuleset,
  IndexedCMPRuleset,
  filterCompactRules,
} from '@duckduckgo/autoconsent';
import compactRules from '@duckduckgo/autoconsent/rules/compact-rules.json' with { type: 'json' };

export interface FrameContext {
  url: string;
  mainFrame: boolean;
}

/**
 * The Bundled Rules (in compact form) that autoconsent should run in one frame: the
 * generic rules plus the Site-specific ones whose Match fits the frame's URL and kind.
 */
export function compactRulesForFrame(frame: FrameContext): CompactCMPRuleset {
  // A JSON import is typed by its literal shape, which TypeScript can't match to the ruleset's tuple types
  return filterCompactRules(compactRules as IndexedCMPRuleset, frame);
}
