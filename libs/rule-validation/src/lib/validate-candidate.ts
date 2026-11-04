import { ownedRuleFields } from './owned-fields.js';
import { RuleContext } from './rule-context.js';
import { isJsonObject } from './steps.js';
import { CandidateValidation, checkRule } from './validate-rule.js';

/**
 * Validation of a candidate Rule as the LLM writes it (see `llmRuleSchema`): our code sets
 * `name` and `minimumRuleStepVersion`, overwriting any the candidate brings, then the Rule
 * goes through `validateRule`. A valid result carries the Rule, ready to run.
 */
export function validateCandidate(candidate: unknown, context: RuleContext): CandidateValidation {
  const rule: unknown = isJsonObject(candidate) ? { ...candidate, ...ownedRuleFields(candidate, context) } : candidate;
  return checkRule(rule, context);
}
