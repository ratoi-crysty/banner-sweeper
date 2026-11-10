/**
 * Runner module types. FE-safe: plain TypeScript. The autoconsent rule types are re-exported
 * type-only (erased at build), so the FE needs @duckduckgo/autoconsent only as a devDependency.
 */
import type { ContextSettings } from '../../playwright/types';

export type { AutoConsentCMPRule, AutoConsentRuleStep, RuleBundle } from '@duckduckgo/autoconsent';

export interface RunRequest {
  url: string;
  /** Total time budget, ms. Default 25000. */
  timeoutMs?: number;
  context?: ContextSettings;
}

/** What happened when autoconsent ran on a fresh page load. */
export interface AutoconsentRunReport {
  /** Name of the CMP rule autoconsent matched, if any. */
  cmpDetected: string | null;
  popupFound: boolean;
  optOutResult: boolean | null;
  selfTestResult: boolean | null;
  done: boolean;
  errors: string[];
  /** Message types in the order received, for debugging. */
  timeline: string[];
  /** Set when the site served an error / bot-challenge page instead of the real one. */
  blocked?: string;
}
