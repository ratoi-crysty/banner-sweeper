import { AutoConsentCMPRule } from '@duckduckgo/autoconsent';
import { RuleProblem } from '../rule-problem.js';
import {
  ACTIONS,
  MODIFIER_ACTIONS,
  PRESENCE_TESTED_ACTIONS,
} from '../step-actions.js';
import { isJsonObject, JsonObject, stepsOf, VisitedStep } from '../steps.js';

const OFFERED_ACTIONS: readonly string[] = ACTIONS.filter(
  (action: string): boolean => action !== 'eval',
);

const SELECTOR_ACTIONS: readonly string[] = MODIFIER_ACTIONS['selector'] ?? [];

type RequiredStepList = 'detectCmp' | 'detectPopup' | 'optOut';

const REQUIRED_STEP_LISTS: readonly RequiredStepList[] = [
  'detectCmp',
  'detectPopup',
  'optOut',
];

function quoted(names: readonly string[]): string {
  return names.map((name: string): string => `\`${name}\``).join(', ');
}

function conditionProblems(condition: JsonObject, path: string): RuleProblem[] {
  const problems: RuleProblem[] = [];
  const tests: string[] = ['exists', 'visible'].filter(
    (key: string): boolean => condition[key] !== undefined,
  );
  if (tests.length !== 1) {
    problems.push({
      path,
      message: 'needs exactly one of `exists` or `visible`',
    });
  }
  if (condition['check'] !== undefined && condition['visible'] === undefined) {
    problems.push({
      path: `${path}.check`,
      message: 'only applies to `visible`',
    });
  }
  return problems;
}

function actionProblems(
  step: JsonObject,
  path: string,
  action: string,
): RuleProblem[] {
  const problems: RuleProblem[] = [];
  if (!PRESENCE_TESTED_ACTIONS.includes(action) && !step[action]) {
    problems.push({
      path: `${path}.${action}`,
      message: 'is empty, so autoconsent ignores the Step',
    });
  }
  for (const [modifier, actions] of Object.entries(MODIFIER_ACTIONS)) {
    if (step[modifier] !== undefined && !actions.includes(action)) {
      problems.push({
        path: `${path}.${modifier}`,
        message: `only applies to ${quoted(actions)}, not \`${action}\``,
      });
    }
  }
  if (SELECTOR_ACTIONS.includes(action) && step['selector'] === undefined) {
    problems.push({ path, message: `\`${action}\` needs a \`selector\`` });
  }
  if (action === 'if') {
    const condition: unknown = step['if'];
    if (isJsonObject(condition)) {
      problems.push(...conditionProblems(condition, `${path}.if`));
    }
    if (step['then'] === undefined) {
      problems.push({ path, message: '`if` needs `then`' });
    }
  }
  return problems;
}

function stepProblems({ step, path }: VisitedStep): RuleProblem[] {
  const actions: string[] = ACTIONS.filter(
    (key: string): boolean => step[key] !== undefined,
  );
  const [action]: string[] = actions;
  if (action === undefined) {
    return [
      {
        path,
        message: `has no action: a Step needs exactly one of ${quoted(OFFERED_ACTIONS)}`,
      },
    ];
  }
  if (actions.length > 1) {
    return [
      {
        path,
        message: `has ${actions.length} actions (${quoted(actions)}): a Step needs exactly one, so split it into several Steps`,
      },
    ];
  }
  return actionProblems(step, path, action);
}

/** Each Step does exactly one thing, and the Step lists that must do something aren't empty. */
export function stepShapeProblems(rule: AutoConsentCMPRule): RuleProblem[] {
  const problems: RuleProblem[] = [];
  for (const list of REQUIRED_STEP_LISTS) {
    if (rule[list].length === 0) {
      problems.push({ path: `$.${list}`, message: 'needs at least one Step' });
    }
  }
  if (rule.test?.length === 0) {
    problems.push({
      path: '$.test',
      message: 'needs at least one Step, or leave `test` out',
    });
  }
  return [...problems, ...stepsOf(rule).flatMap(stepProblems)];
}
