import { AutoConsentCMPRule } from '@duckduckgo/autoconsent';
import { RuleProblem } from '../rule-problem.js';
import { isJsonObject, JsonObject, stepsOf, VisitedStep } from '../steps.js';

// Starting values, to be tuned against the test set
const MAX_WAIT_MS = 5000;
const MAX_TIMEOUT_MS = 10000;
const MAX_RETRY = 5;
const MAX_NESTING = 3;
const MAX_STEPS = 40;
const MAX_SELECTOR_LENGTH = 500;
const MAX_SERIALIZED_BYTES: number = 16 * 1024;

interface NumberCap {
  field: string;
  max: number;
  unit: string;
}

const NUMBER_CAPS: readonly NumberCap[] = [
  { field: 'wait', max: MAX_WAIT_MS, unit: ' ms' },
  { field: 'timeout', max: MAX_TIMEOUT_MS, unit: ' ms' },
  { field: 'retry', max: MAX_RETRY, unit: '' },
];

// Step fields holding an element selector, a string or an array that pierces shadow roots and iframes
const SELECTOR_FIELDS: readonly string[] = [
  'exists',
  'visible',
  'waitFor',
  'waitForVisible',
  'click',
  'waitForThenClick',
  'selector',
  'hide',
];

function selectorProblems(selector: unknown, path: string): RuleProblem[] {
  if (Array.isArray(selector)) {
    return selector.flatMap((part: unknown, index: number): RuleProblem[] =>
      selectorProblems(part, `${path}[${index}]`),
    );
  }
  if (typeof selector === 'string' && selector.length > MAX_SELECTOR_LENGTH) {
    return [
      {
        path,
        message: `is ${selector.length} characters long; a selector may have at most ${MAX_SELECTOR_LENGTH}`,
      },
    ];
  }
  return [];
}

function selectorFieldProblems(
  fields: JsonObject,
  path: string,
): RuleProblem[] {
  return SELECTOR_FIELDS.flatMap((field: string): RuleProblem[] =>
    selectorProblems(fields[field], `${path}.${field}`),
  );
}

function stepCapProblems({ step, path, nesting }: VisitedStep): RuleProblem[] {
  const problems: RuleProblem[] = [];
  for (const { field, max, unit } of NUMBER_CAPS) {
    const value: unknown = step[field];
    if (typeof value === 'number' && value > max) {
      problems.push({
        path: `${path}.${field}`,
        message: `is ${value}${unit}; at most ${max}${unit} is allowed`,
      });
    }
  }
  if (
    (step['if'] !== undefined || step['any'] !== undefined) &&
    nesting >= MAX_NESTING
  ) {
    problems.push({
      path,
      message: `nests \`if\`/\`any\` more than ${MAX_NESTING} levels deep`,
    });
  }
  problems.push(...selectorFieldProblems(step, path));
  const condition: unknown = step['if'];
  if (isJsonObject(condition)) {
    problems.push(...selectorFieldProblems(condition, `${path}.if`));
  }
  return problems;
}

/** Limits on how long a Rule may wait and how big it may get. */
export function capProblems(rule: AutoConsentCMPRule): RuleProblem[] {
  const problems: RuleProblem[] = [];
  const bytes: number = new TextEncoder().encode(JSON.stringify(rule)).length;
  if (bytes > MAX_SERIALIZED_BYTES) {
    problems.push({
      path: '$',
      message: `is ${bytes} bytes serialized; a Rule may be at most ${MAX_SERIALIZED_BYTES} bytes (16 KB)`,
    });
  }
  const steps: VisitedStep[] = stepsOf(rule);
  if (steps.length > MAX_STEPS) {
    problems.push({
      path: '$',
      message: `has ${steps.length} Steps; a Rule may have at most ${MAX_STEPS}`,
    });
  }
  (rule.prehideSelectors ?? []).forEach(
    (selector: string, index: number): void => {
      problems.push(
        ...selectorProblems(selector, `$.prehideSelectors[${index}]`),
      );
    },
  );
  return [...problems, ...steps.flatMap(stepCapProblems)];
}
