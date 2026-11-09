/**
 * Validator module types. FE-safe: plain TypeScript.
 */
import type { ContextSettings } from '../../playwright/types';
import type { AutoConsentCMPRule, AutoconsentRunReport } from '../../runner/types';

export interface ValidateRuleRequest {
  url: string;
  rule: AutoConsentCMPRule;
  timeoutMs?: number;
  context?: ContextSettings;
}

export interface SelectorCheck {
  selector: string;
  /** Where the selector is used in the rule, e.g. "optOut[1].waitForThenClick". */
  role: string;
  /** Matches on the page. */
  count: number;
  /** Visible matches (up to 5 checked). */
  visible: number;
}

export interface ValidationResult {
  passed: boolean;
  report: AutoconsentRunReport;
  /** Banner still on screen after opt-out (checked by us, independently of autoconsent). */
  bannerVisibleAfter: boolean | null;
  /** Per-selector presence when the popup was found (or at the end if it never was). */
  selectorChecks: SelectorCheck[];
  /** Human/LLM-readable explanation. */
  feedback: string;
}
