import { AutoConsentCMPRule } from '@duckduckgo/autoconsent';
import { BUNDLED_RULE_NAMES } from '../bundled-rules.js';
import { HARD_CODED_CMP_NAMES } from '../hard-coded-cmps.js';
import { minimumRuleStepVersion, ruleName } from '../owned-fields.js';
import { RuleContext } from '../rule-context.js';
import { RuleProblem } from '../rule-problem.js';

/** `name` and `minimumRuleStepVersion` are set by our code; Rule metadata is ours too. */
export function ownedFieldProblems(
  rule: AutoConsentCMPRule,
  context: RuleContext,
): RuleProblem[] {
  const problems: RuleProblem[] = [];
  const name: string = ruleName(context);
  if (rule.name.startsWith('auto_')) {
    problems.push({
      path: '$.name',
      message: 'must not start with `auto_`: autoconsent drops such rules',
    });
  }
  if (BUNDLED_RULE_NAMES.has(rule.name)) {
    problems.push({
      path: '$.name',
      message: `collides with the Bundled Rule "${rule.name}"`,
    });
  }
  if (HARD_CODED_CMP_NAMES.includes(rule.name)) {
    problems.push({
      path: '$.name',
      message: `collides with the hard-coded CMP "${rule.name}": autoconsent drops such rules`,
    });
  }
  if (rule.name !== name) {
    problems.push({ path: '$.name', message: `must be "${name}"` });
  }

  const version: number = minimumRuleStepVersion(rule);
  if (rule.minimumRuleStepVersion !== version) {
    problems.push({
      path: '$.minimumRuleStepVersion',
      message: `must be ${version}, the rule step version the Steps used need`,
    });
  }
  for (const field of ['_metadata', 'vendorUrl'] as const) {
    if (rule[field] !== undefined) {
      problems.push({
        path: `$.${field}`,
        message: 'is not allowed: our code owns Rule metadata',
      });
    }
  }
  return problems;
}
