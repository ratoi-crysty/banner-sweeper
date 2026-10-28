---
status: accepted
---

# Detection drives the browser through our own tools, not Anthropic's browser toolset

The Detection agent drives the browser through a narrow tool set of our own (`read_page`, `find`, `inspect`, `query`, `click`, …), defined once and exposed byte-identically on every LLM backend. We don't use Anthropic's `browser_toolset_20260801`, even on the Claude backend. The test set exists to compare models and backends, and giving each backend different tools would confound that comparison. Local models aren't trained on the toolset anyway. Rules are made of CSS selectors, and the toolset's accessibility-tree refs show none of the ids, classes or attributes selectors are built from, so we would need our own inspection tools regardless.

## Considered Options

- **Anthropic's browser toolset, trimmed with `configs`, plus our Rule tools.** Rejected: Claude-only, and local backends would need a second definition over the same executor. Its prompt-injection classifiers add little here. The exploration browser holds no secrets, and every Rule goes through Verification and Admin approval.
- **The toolset on Claude, our tools on local backends.** Rejected: it confounds the test-set comparison between backends.

## Consequences

- The tool logic runs in a probe built from autoconsent's own `lib/dom-actions.ts` and `lib/utils.ts` (MPL-2.0). "Visible" and "matches" therefore mean exactly what they mean to a Rule's Steps.
- Running the trimmed toolset on Claude stays open as a test-set experiment. If it clearly outperforms our tools, revisit this decision.
