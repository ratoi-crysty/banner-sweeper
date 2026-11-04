/**
 * Generates the Rule JSON Schema from autoconsent's shipped `dist/types/rules.d.ts`, and the
 * LLM-facing variant derived from it. Both are committed.
 *
 *   node scripts/generate-schemas.mts          write both files
 *   node scripts/generate-schemas.mts --check  fail if either differs from a fresh generation
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { format, type Options, resolveConfig } from 'prettier';
import { createGenerator, type Schema } from 'ts-json-schema-generator';

interface SchemaFile {
  path: string;
  schema: Schema;
}

type Definitions = NonNullable<Schema['definitions']>;
type SchemaDefinition = Definitions[string];

const RULE_TYPE = 'AutoConsentCMPRule';
const SCHEMA_DIR: string = path.join(import.meta.dirname, '../src/lib/schema');

// Fields our code owns or Validation always rejects, so the LLM is never offered them
const LLM_DROPPED_RULE_FIELDS: string[] = [
  'name',
  'minimumRuleStepVersion',
  '_metadata',
  'vendorUrl',
  'intermediate',
  'openCmp',
  'cosmetic',
];
const LLM_DROPPED_RUN_CONTEXT_FIELDS: string[] = ['frame'];
const LLM_DROPPED_STEP_FIELDS: string[] = ['eval'];

function rulesTypesPath(): string {
  const require: NodeJS.Require = createRequire(import.meta.url);
  // The package doesn't export its types folder, so resolve it next to the bundle
  const bundle: string = require.resolve('@duckduckgo/autoconsent');
  return path.join(path.dirname(bundle), 'types/rules.d.ts');
}

function generateRuleSchema(): Schema {
  return createGenerator({
    path: rulesTypesPath(),
    type: RULE_TYPE,
    skipTypeCheck: true,
  }).createSchema(RULE_TYPE);
}

function objectDefinition(definitions: Definitions, name: string): Schema {
  const definition: SchemaDefinition | undefined = definitions[name];
  if (typeof definition !== 'object' || definition.properties === undefined) {
    throw new Error(`The generated schema has no object definition "${name}"`);
  }
  return definition;
}

function dropProperties(schema: Schema, names: string[]): void {
  for (const name of names) {
    delete schema.properties?.[name];
  }
  schema.required = schema.required?.filter((required: string): boolean => !names.includes(required));
}

/**
 * The schema offered to the LLM as a non-strict tool `input_schema`: an object at the root,
 * without the fields our code owns or Validation rejects, and with `optIn` fixed to `[]`.
 */
function toLlmRuleSchema(schema: Schema): Schema {
  const definitions: Definitions = structuredClone(schema.definitions ?? {});
  const rule: Schema = objectDefinition(definitions, RULE_TYPE);

  dropProperties(rule, LLM_DROPPED_RULE_FIELDS);
  dropProperties(objectDefinition(definitions, 'RunContext'), LLM_DROPPED_RUN_CONTEXT_FIELDS);
  dropProperties(objectDefinition(definitions, 'AutoConsentRuleStep'), LLM_DROPPED_STEP_FIELDS);
  rule.properties = {
    ...rule.properties,
    optIn: {
      type: 'array',
      maxItems: 0,
      description: 'Always `[]`: a Rule never Accepts.',
    },
  };
  delete definitions[RULE_TYPE];

  return { ...rule, definitions };
}

// Format with the repo's Prettier config, so the committed files also pass `nx format:check`
async function serialize(file: SchemaFile): Promise<string> {
  const options: Options = (await resolveConfig(file.path)) ?? {};
  return format(JSON.stringify(file.schema), { ...options, filepath: file.path });
}

// Compares content, not bytes: how Prettier lays out a JSON file depends on its previous layout
async function isUpToDate(file: SchemaFile): Promise<boolean> {
  try {
    const committed: unknown = JSON.parse(await readFile(file.path, 'utf8'));
    // Round-trip the fresh schema so keys JSON drops (set to `undefined`) don't count
    return isDeepStrictEqual(committed, JSON.parse(JSON.stringify(file.schema)));
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  const schema: Schema = generateRuleSchema();
  const files: SchemaFile[] = [
    { path: path.join(SCHEMA_DIR, 'rule.schema.json'), schema },
    {
      path: path.join(SCHEMA_DIR, 'llm-rule.schema.json'),
      schema: toLlmRuleSchema(schema),
    },
  ];

  if (!process.argv.includes('--check')) {
    for (const file of files) {
      await writeFile(file.path, await serialize(file));
    }
    return;
  }

  const stale: SchemaFile[] = [];
  for (const file of files) {
    if (!(await isUpToDate(file))) {
      stale.push(file);
    }
  }
  if (stale.length > 0) {
    for (const file of stale) {
      console.error(`Schema drift: ${path.relative(process.cwd(), file.path)}`);
    }
    console.error(
      "The installed autoconsent's rule types changed. Run `nx run @banner-sweeper/rule-validation:generate-schemas`, review the diff, and recheck src/lib/step-actions.ts and the hard-coded CMP names.",
    );
    process.exitCode = 1;
  }
}

await main();
