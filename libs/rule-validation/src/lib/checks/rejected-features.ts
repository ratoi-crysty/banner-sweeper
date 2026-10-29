import { AutoConsentCMPRule } from '@duckduckgo/autoconsent';
import { RuleProblem } from '../rule-problem.js';
import { stepsOf } from '../steps.js';

/** Features autoconsent supports that our Rules may never use. */
export function rejectedFeatureProblems(
  rule: AutoConsentCMPRule,
): RuleProblem[] {
  const problems: RuleProblem[] = [];
  if (rule.optIn.length > 0) {
    problems.push({
      path: '$.optIn',
      message: 'must be `[]`: a Rule never Accepts',
    });
  }
  if (rule.openCmp !== undefined) {
    problems.push({
      path: '$.openCmp',
      message: 'is not allowed: Detection never opens a CMP',
    });
  }
  if (rule.intermediate === true) {
    problems.push({
      path: '$.intermediate',
      message:
        'must not be true: Verification needs the Rule to finish (`autoconsentDone`)',
    });
  }
  if (rule.runContext?.frame === true) {
    problems.push({
      path: '$.runContext.frame',
      message:
        'must not be true: a Rule runs in the top frame only, so its urlPattern matches the Site',
    });
  }
  if (rule.cosmetic === true) {
    problems.push({
      path: '$.cosmetic',
      message:
        'must not be true: a cosmetic Rule only hides the banner and never Declines it. If the banner offers no free refusal, call `report_no_refusal` instead',
    });
  }
  for (const { step, path } of stepsOf(rule)) {
    if (step['eval'] !== undefined) {
      problems.push({
        path: `${path}.eval`,
        message: 'is not allowed: a Rule never runs code',
      });
    }
  }
  return problems;
}
