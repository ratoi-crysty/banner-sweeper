import { capProblems } from './checks/caps.js';
import { ownedFieldProblems } from './checks/owned-fields.js';
import { rejectedFeatureProblems } from './checks/rejected-features.js';
import { stepShapeProblems } from './checks/step-shape.js';
import { RuleContext } from './rule-context.js';
import { RuleProblem } from './rule-problem.js';
import { checkSchema, SchemaResult } from './schema.js';

export type { RuleContext } from './rule-context.js';
export type { RuleProblem } from './rule-problem.js';

/**
 * Validation, the hard gate every candidate Rule passes before it runs: every problem found,
 * or `[]` for a valid Rule. Code never repairs a Rule.
 */
export function validateRule(
  rule: unknown,
  context: RuleContext,
): RuleProblem[] {
  const schema: SchemaResult = checkSchema(rule);
  if (!schema.valid) {
    return schema.problems;
  }
  return [
    ...ownedFieldProblems(schema.rule, context),
    ...rejectedFeatureProblems(schema.rule),
    ...stepShapeProblems(schema.rule),
    ...capProblems(schema.rule),
  ];
}
