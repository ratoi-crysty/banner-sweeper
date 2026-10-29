export type JsonObject = Readonly<Record<string, unknown>>;

/** One Step of a Rule, found wherever it sits. */
export interface VisitedStep {
  step: JsonObject;
  /** JSON path of the Step, e.g. `$.optOut[1].then[0]`. */
  path: string;
  /** How many `if`/`any` Steps enclose it: 0 for a Step directly in a Step list. */
  nesting: number;
}

export const STEP_LISTS: readonly string[] = [
  'detectCmp',
  'detectPopup',
  'optOut',
  'optIn',
  'openCmp',
  'test',
];

// `then`/`else` belong to `if`, the Steps of `any` to `any`
const NESTED_STEP_LISTS: readonly string[] = ['then', 'else', 'any'];

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function visitList(
  list: unknown,
  path: string,
  nesting: number,
  visited: VisitedStep[],
): void {
  if (!Array.isArray(list)) {
    return;
  }
  list.forEach((step: unknown, index: number): void => {
    if (!isJsonObject(step)) {
      return;
    }
    const stepPath = `${path}[${index}]`;
    visited.push({ step, path: stepPath, nesting });
    for (const key of NESTED_STEP_LISTS) {
      visitList(step[key], `${stepPath}.${key}`, nesting + 1, visited);
    }
  });
}

/**
 * Every Step of the Rule, depth first, in every Step list and nested in `if`/`any`. Anything
 * that isn't a Step is skipped, so this is safe on input that hasn't passed Validation.
 */
export function stepsOf(rule: unknown): VisitedStep[] {
  const visited: VisitedStep[] = [];
  if (isJsonObject(rule)) {
    for (const key of STEP_LISTS) {
      visitList(rule[key], `$.${key}`, 0, visited);
    }
  }
  return visited;
}
