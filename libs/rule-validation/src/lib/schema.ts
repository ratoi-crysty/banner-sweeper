import { AutoConsentCMPRule } from '@duckduckgo/autoconsent';
import { Ajv, ErrorObject, ValidateFunction } from 'ajv';
import generatedLlmRuleSchema from './schema/llm-rule.schema.json' with { type: 'json' };
import generatedRuleSchema from './schema/rule.schema.json' with { type: 'json' };
import { EVAL_NOT_ALLOWED } from './checks/rejected-features.js';
import { RuleProblem } from './rule-problem.js';

export interface JsonSchema {
  readonly [keyword: string]: unknown;
}

/** The JSON Schema of an autoconsent rule, generated from autoconsent's shipped types. */
export const ruleSchema: JsonSchema = generatedRuleSchema;

/**
 * The Rule schema offered to the LLM, as a non-strict tool `input_schema`. It leaves out the
 * fields our code owns or Validation rejects, and fixes `optIn` to `[]`. `validateRule` stays
 * the authority.
 */
export const llmRuleSchema: JsonSchema = generatedLlmRuleSchema;

const validateSchema: ValidateFunction<AutoConsentCMPRule> = new Ajv({
  allErrors: true,
  allowUnionTypes: true,
}).compile<AutoConsentCMPRule>(ruleSchema);

/** `/optOut/0/click` → `$.optOut[0].click` */
function jsonPath(pointer: string): string {
  return pointer
    .split('/')
    .slice(1)
    .map((segment: string): string =>
      segment.replaceAll('~1', '/').replaceAll('~0', '~'),
    )
    .reduce(
      (path: string, segment: string): string =>
        /^\d+$/.test(segment) ? `${path}[${segment}]` : `${path}.${segment}`,
      '$',
    );
}

function schemaProblem(error: ErrorObject): RuleProblem {
  const path: string = jsonPath(error.instancePath);
  if (error.keyword === 'additionalProperties') {
    return {
      path: `${path}.${String(error.params['additionalProperty'])}`,
      message: 'is not a field of an autoconsent rule',
    };
  }
  // Every `eval` is rejected, so don't send the LLM looking for a bundled snippet
  if (error.instancePath.endsWith('/eval')) {
    return { path, message: EVAL_NOT_ALLOWED };
  }
  if (error.schemaPath.endsWith('/ElementSelector/anyOf')) {
    return {
      path,
      message: 'must be a selector: a string, or an array of strings',
    };
  }
  if (error.keyword === 'required') {
    return {
      path: `${path}.${String(error.params['missingProperty'])}`,
      message: 'is required',
    };
  }
  return { path, message: error.message ?? 'does not match the schema' };
}

// An `anyOf` error already sums up why each of its branches failed
function isInsideFailedAnyOf(
  error: ErrorObject,
  errors: ErrorObject[],
): boolean {
  return errors.some(
    (other: ErrorObject): boolean =>
      other.keyword === 'anyOf' &&
      other.instancePath === error.instancePath &&
      error.schemaPath.startsWith(`${other.schemaPath}/`),
  );
}

function isSameProblem(a: RuleProblem, b: RuleProblem): boolean {
  return a.path === b.path && a.message === b.message;
}

interface SchemaPass {
  valid: true;
  rule: AutoConsentCMPRule;
}

interface SchemaFailure {
  valid: false;
  problems: RuleProblem[];
}

export type SchemaResult = SchemaPass | SchemaFailure;

export function checkSchema(rule: unknown): SchemaResult {
  if (validateSchema(rule)) {
    return { valid: true, rule };
  }
  const errors: ErrorObject[] = validateSchema.errors ?? [];
  const problems: RuleProblem[] = errors
    .filter(
      (error: ErrorObject): boolean => !isInsideFailedAnyOf(error, errors),
    )
    .map(schemaProblem);
  return {
    valid: false,
    problems: problems.filter(
      (problem: RuleProblem, index: number): boolean =>
        problems.findIndex((other: RuleProblem): boolean =>
          isSameProblem(problem, other),
        ) === index,
    ),
  };
}
