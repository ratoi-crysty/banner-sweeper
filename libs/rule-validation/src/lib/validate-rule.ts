import { AutoConsentCMPRule } from '@duckduckgo/autoconsent';
import { capProblems } from './checks/caps.js';
import { ownedFieldProblems } from './checks/owned-fields.js';
import { rejectedFeatureProblems } from './checks/rejected-features.js';
import { stepShapeProblems } from './checks/step-shape.js';
import { RuleContext } from './rule-context.js';
import { RuleProblem } from './rule-problem.js';
import { checkSchema, SchemaResult } from './schema.js';

export interface ValidRule {
  valid: true;
  rule: AutoConsentCMPRule;
}

export interface InvalidRule {
  valid: false;
  problems: RuleProblem[];
}

/** A Rule that passed Validation, typed, or every problem that stops it. */
export type CandidateValidation = ValidRule | InvalidRule;

export function checkRule(rule: unknown, context: RuleContext): CandidateValidation {
  const schema: SchemaResult = checkSchema(rule);
  if (!schema.valid) {
    return schema;
  }
  const problems: RuleProblem[] = [
    ...ownedFieldProblems(schema.rule, context),
    ...rejectedFeatureProblems(schema.rule),
    ...stepShapeProblems(schema.rule),
    ...capProblems(schema.rule),
  ];
  return problems.length === 0 ? { valid: true, rule: schema.rule } : { valid: false, problems };
}

/**
 * Validation, the hard gate every Rule passes before it runs: every problem found, or `[]` for
 * a valid Rule. Code never repairs a Rule.
 */
export function validateRule(rule: unknown, context: RuleContext): RuleProblem[] {
  const result: CandidateValidation = checkRule(rule, context);
  return result.valid ? [] : result.problems;
}
