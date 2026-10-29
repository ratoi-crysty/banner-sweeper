import { RuleContext } from './rule-context.js';
import { ACTION_STEP_VERSIONS } from './step-actions.js';
import { stepsOf, VisitedStep } from './steps.js';

/** The Rule fields our code sets, never the LLM. */
export interface OwnedRuleFields {
  name: string;
  minimumRuleStepVersion: number;
}

export function ruleName(context: RuleContext): string {
  return `bs_${new URL(context.url).hostname.toLowerCase()}`;
}

export function minimumRuleStepVersion(rule: unknown): number {
  return stepsOf(rule).reduce(
    (version: number, { step }: VisitedStep): number =>
      Math.max(
        version,
        ...Object.keys(step).map(
          (key: string): number => ACTION_STEP_VERSIONS[key] ?? 1,
        ),
      ),
    1,
  );
}

/**
 * The `name` and `minimumRuleStepVersion` a Rule written for this job must carry, for callers
 * to fill in before Validation. Safe on input that hasn't passed Validation.
 */
export function ownedRuleFields(
  rule: unknown,
  context: RuleContext,
): OwnedRuleFields {
  return {
    name: ruleName(context),
    minimumRuleStepVersion: minimumRuleStepVersion(rule),
  };
}
