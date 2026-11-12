import type { AutoConsentCMPRule } from '@duckduckgo/autoconsent';
import type { AgentStep, ProviderConfig } from '../../agent';
import type { ContextSettings } from '../../playwright';
import type { ValidationResult } from '../../validator';

/** What the agent proposes; the BE turns it into an autoconsent rule. */
export interface RuleSpec {
  /** Outermost element of the banner. Used for detection, prehide and the self-test. */
  containerSelector: string;
  /** Optional selector that identifies the CMP more specifically than the container. */
  detectSelector?: string;
  /** Selectors clicked in order to opt out, e.g. ["#manage", "#reject-all"] for a 2-layer banner. */
  optOutClicks: string[];
  /** Selector clicked to accept. Optional. */
  optInClick?: string;
  /** If the banner lives in an iframe: that iframe's URL. */
  frameUrl?: string;
  /** No reject option exists: just hide the banner (cosmetic rule). */
  cosmetic?: boolean;
}

export interface GenerateRuleRequest {
  url: string;
  /** Default: the server's AgentModule defaultProvider. */
  provider?: ProviderConfig;
  /** Rule name. Default: llm_<host>. Must not start with "auto_" (reserved by autoconsent). */
  name?: string;
  /** First check whether autoconsent's bundled rules already handle the site. Default true. */
  checkBundledRules?: boolean;
  /** Max agent turns. Default 20. */
  maxSteps?: number;
  /** Wait after load before the agent looks (banners often load late). Default 2500 ms. */
  settleMs?: number;
  /** e.g. { locale: 'ro-RO', timezoneId: 'Europe/Bucharest' } to see what local visitors see. */
  context?: ContextSettings;
}

export type GenerateRuleStatus =
  | 'generated'
  | 'covered-by-bundled-rule'
  | 'blocked'
  | 'no-banner'
  | 'failed'
  | 'cancelled';

export type GenerateRuleResult =
  | { status: 'generated'; rule: AutoConsentCMPRule; validation: ValidationResult; summary: string; steps: AgentStep[] }
  | { status: 'covered-by-bundled-rule'; cmp: string; summary: string; steps: AgentStep[] }
  | {
      status: 'blocked' | 'no-banner' | 'failed' | 'cancelled';
      summary: string;
      steps: AgentStep[];
      rule?: AutoConsentCMPRule;
      validation?: ValidationResult;
    };

export type GenerationJobState = 'queued' | 'running' | 'finished' | 'error';

/** A generation job as returned by the API. Steps never include screenshots (imageBase64). */
export interface GenerationJob {
  id: string;
  state: GenerationJobState;
  request: GenerateRuleRequest;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  steps: AgentStep[];
  logs: string[];
  result?: GenerateRuleResult;
  error?: string;
}

/** Server-sent events on GET /rules/generate/:id/events (the SSE `data` payload). */
export type GenerationEvent =
  | { type: 'state'; state: GenerationJobState }
  | { type: 'log'; message: string }
  | { type: 'step'; step: AgentStep }
  | { type: 'result'; result: GenerateRuleResult }
  | { type: 'error'; error: string };

export interface CreateGenerationJobResponse {
  id: string;
  state: GenerationJobState;
}
