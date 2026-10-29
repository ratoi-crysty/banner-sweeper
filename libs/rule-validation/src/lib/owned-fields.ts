import { RuleContext } from './rule-context.js';
import { stepsOf, VisitedStep } from './steps.js';

/** The Rule fields our code sets, never the LLM. */
export interface OwnedRuleFields {
  name: string;
  minimumRuleStepVersion: number;
}

// The autoconsent rule step version each newer action needs; every other action is version 1
const ACTION_STEP_VERSIONS: Readonly<Record<string, number>> = {
  removeClass: 2,
  setStyle: 2,
  addStyle: 2,
  stylesheet: 3,
};

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
