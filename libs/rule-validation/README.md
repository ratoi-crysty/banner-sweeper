# rule-validation

**Validation**: the hard gate every candidate Rule passes before it runs. An invalid Rule is never run or returned, and code never repairs one.

- `validateCandidate(candidate, { url })`: Validation of a Rule as the LLM writes it, for `try_rule` and `submit_rule`. Our code sets `name` (`bs_<hostname>`) and `minimumRuleStepVersion` (computed from the Steps used), overwriting any the candidate brings, then validates. It returns `{ valid: true, rule }`, the Rule typed and ready to run, or `{ valid: false, problems }`.
- `validateRule(rule, { url })`: Validation of a complete Rule: every problem, as `{ path, message }[]` (`path` is a JSON path such as `$.optOut[0].click`), or `[]` for a valid Rule.
  Both check the schema first; only a Rule that matches the schema goes on to the checks on the fields our code owns, the features our Rules may not use, Step shape and the caps.
- `llmRuleSchema`: the Rule schema offered to the LLM as a non-strict tool `input_schema`. It has no `eval`, `name`, `minimumRuleStepVersion`, `_metadata`, `vendorUrl`, `frame`, `intermediate`, `openCmp` or `cosmetic`, and `optIn` is fixed to `[]`. Its `$ref`s point into its own root `definitions`. The full schema it is derived from is generated from the pinned autoconsent's `dist/types/rules.d.ts`, and stays internal.
- `HARD_CODED_CMP_NAMES`: the 11 CMPs autoconsent implements in code. A unit test checks the list against autoconsent's source.

## Upgrading autoconsent

Both schemas are generated and committed under `src/lib/schema/`. After an upgrade, `schema-drift` (run in CI) fails if the installed autoconsent's rule types changed:

```sh
pnpm exec nx run @banner-sweeper/rule-validation:generate-schemas   # regenerate both schemas
pnpm exec nx run @banner-sweeper/rule-validation:schema-drift       # fail on drift
```

Review the schema diff, then recheck the Step actions and modifiers Validation knows (`src/lib/step-actions.ts`) and the hard-coded CMP names.

## Running unit tests

Run `pnpm exec nx test @banner-sweeper/rule-validation` to execute the unit tests via [Vitest](https://vitest.dev/).
