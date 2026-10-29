# rule-validation

**Validation**: the hard gate every candidate Rule passes before it runs. An invalid Rule is never run or returned, and code never repairs one.

- `validateRule(rule, { url })`: every problem with the Rule, as `{ path, message }[]` (`path` is a JSON path such as `$.optOut[0].click`), or `[]` for a valid Rule. It checks the schema, the fields our code owns, the features our Rules may not use, Step shape and the caps.
- `ownedRuleFields(rule, { url })`: the `name` (`bs_<hostname>`) and `minimumRuleStepVersion` (computed from the Steps used) a Rule must carry. Callers fill these in; the LLM never writes them.
- `ruleSchema`: the JSON Schema of an autoconsent rule, generated from the pinned autoconsent's `dist/types/rules.d.ts`.
- `llmRuleSchema`: the variant offered to the LLM as a non-strict tool `input_schema`. It has no `eval`, `name`, `minimumRuleStepVersion`, `_metadata`, `vendorUrl`, `frame`, `intermediate`, `openCmp` or `cosmetic`, and `optIn` is fixed to `[]`. Its `$ref`s point into its own root `definitions`, so a tool that nests it under a property must move `definitions` to its own root. `validateRule` stays the authority.
- `HARD_CODED_CMP_NAMES`: the 11 CMPs autoconsent implements in code. A unit test checks the list against autoconsent's source.

## Upgrading autoconsent

Both schemas are generated and committed under `src/lib/schema/`. After an upgrade, `schema-check` (run in CI) fails if the installed autoconsent's rule types changed:

```sh
pnpm exec nx run @banner-sweeper/rule-validation:generate-schemas   # regenerate both schemas
pnpm exec nx run @banner-sweeper/rule-validation:schema-check       # fail on drift
```

Review the schema diff, then recheck the Step actions and modifiers Validation knows (`src/lib/checks/step-shape.ts`) and the hard-coded CMP names.

## Running unit tests

Run `pnpm exec nx test @banner-sweeper/rule-validation` to execute the unit tests via [Vitest](https://vitest.dev/).
