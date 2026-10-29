import { AutoConsentCMPRule } from '@duckduckgo/autoconsent';
import { Ajv, ValidateFunction } from 'ajv';
import { ownedRuleFields } from './owned-fields.js';
import { JsonSchema, llmRuleSchema, ruleSchema } from './schema.js';
import { validateRule } from './validate-rule.js';

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

describe('ruleSchema', () => {
  it('describes an autoconsent rule', () => {
    const rule: AutoConsentCMPRule = {
      name: 'x',
      detectCmp: [{ exists: '#a' }],
      detectPopup: [{ visible: '#a' }],
      optIn: [{ click: '#accept' }],
      optOut: [{ eval: 'EVAL_ONETRUST_1' }],
      cosmetic: true,
    };
    expect(compile(ruleSchema)(rule)).toBe(true);
  });
});

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
      expect(compile(llmRuleSchema)({ ...LLM_RULE, [field]: true })).toBe(
        false,
      );
    }
  });

  it('does not offer runContext.frame', () => {
    expect(
      propertyNames(definition(llmRuleSchema, 'RunContext')),
    ).not.toContain('frame');
  });

  it('does not offer eval', () => {
    expect(
      propertyNames(definition(llmRuleSchema, 'AutoConsentRuleStep')),
    ).not.toContain('eval');
    expect(
      compile(llmRuleSchema)({
        ...LLM_RULE,
        optOut: [{ eval: 'EVAL_ONETRUST_1' }],
      }),
    ).toBe(false);
  });

  it('fixes optIn to []', () => {
    expect(
      compile(llmRuleSchema)({ ...LLM_RULE, optIn: [{ click: '#accept' }] }),
    ).toBe(false);
  });

  it('gives a valid Rule once our code fills in the fields it owns', () => {
    const rule: Record<string, unknown> = {
      ...LLM_RULE,
      ...ownedRuleFields(LLM_RULE, { url: URL }),
    };
    expect(validateRule(rule, { url: URL })).toEqual([]);
  });
});
