import { Ajv, ValidateFunction } from 'ajv';
import { JsonSchema, llmRuleSchema } from './schema.js';
import { validateCandidate } from './validate-candidate.js';

const URL = 'https://www.example.com/';

// A Rule as the LLM writes it: without the fields our code owns
const LLM_RULE: Record<string, unknown> = {
  prehideSelectors: ['#cookie-banner'],
  runContext: { main: true, urlPattern: '^https://www\\.example\\.com/' },
  detectCmp: [{ exists: '#cookie-banner' }],
  detectPopup: [{ visible: '#cookie-banner' }],
  optIn: [],
  optOut: [
    { waitForThenClick: '#cookie-banner .reject' },
    { removeClass: 'no-scroll', selector: 'body', optional: true },
  ],
};

function compile(schema: JsonSchema): ValidateFunction {
  return new Ajv({ allowUnionTypes: true }).compile(schema);
}

function definition(schema: JsonSchema, name: string): JsonSchema {
  const definitions: unknown = schema['definitions'];
  // The generated schemas keep every named type under `definitions`
  return (definitions as Record<string, JsonSchema>)[name] ?? {};
}

function propertyNames(schema: JsonSchema): string[] {
  return Object.keys(schema['properties'] ?? {});
}

describe('llmRuleSchema', () => {
  it('is an object schema at the root, as a tool input_schema must be', () => {
    expect(llmRuleSchema['type']).toBe('object');
  });

  it('accepts a Rule as the LLM writes it', () => {
    expect(compile(llmRuleSchema)(LLM_RULE)).toBe(true);
  });

  it('does not offer the fields our code owns or Validation rejects', () => {
    for (const field of [
      'name',
      'minimumRuleStepVersion',
      '_metadata',
      'vendorUrl',
      'intermediate',
      'openCmp',
      'cosmetic',
    ]) {
      expect(propertyNames(llmRuleSchema)).not.toContain(field);
      expect(compile(llmRuleSchema)({ ...LLM_RULE, [field]: true })).toBe(false);
    }
  });

  it('does not offer runContext.frame', () => {
    expect(propertyNames(definition(llmRuleSchema, 'RunContext'))).not.toContain('frame');
  });

  it('does not offer eval', () => {
    expect(propertyNames(definition(llmRuleSchema, 'AutoConsentRuleStep'))).not.toContain('eval');
    expect(
      compile(llmRuleSchema)({
        ...LLM_RULE,
        optOut: [{ eval: 'EVAL_ONETRUST_1' }],
      }),
    ).toBe(false);
  });

  it('fixes optIn to []', () => {
    expect(compile(llmRuleSchema)({ ...LLM_RULE, optIn: [{ click: '#accept' }] })).toBe(false);
  });

  it('describes a candidate that passes validateCandidate', () => {
    expect(validateCandidate(LLM_RULE, { url: URL })).toMatchObject({ valid: true });
  });
});
