---
status: accepted
---

# Our Rules are written in autoconsent's rule format

Supersedes [ADR-0002](./0002-declarative-rule-protocol.md) for Consent Banners and amends [ADR-0003](./0003-autoconsent-for-cmps.md).

Our own Rules are autoconsent rules, loaded into the extension's autoconsent instance next to the Bundled Rules (the `rules.autoconsent` list in `initResp`), rather than Rules in a protocol of our own run by a second executor. autoconsent already detects, Declines, self-tests and prehides Consent Banners declaratively, its format is typed, and one executor means a Rule that passes Verification runs the identical code path in Members' browsers. Detection therefore asks the LLM for an autoconsent rule, and Verification runs the real autoconsent library with it.

## Considered Options

- **Our own Step protocol (ADR-0002)** with a second executor running after autoconsent. Rejected for Consent Banners: it duplicates what autoconsent does, and we would maintain two executors.
- **Embedding an autoconsent rule as one Step type inside our Rule.** Rejected: two executors inside one Rule.

## Consequences

- ADR-0002's protocol is parked. Content Overlays and Scroll Locks will be tried in autoconsent's format first; if that is not expressive enough, a custom handler will consume the same autoconsent rule types rather than a protocol of our own.
- ADR-0003's safety constraint now covers our Rules too: a Rule may only reference `eval` snippets bundled in the library, never code strings from rule data.
- How Published Rules reach the extension (a ruleset file on GitHub Pages, or bundled into the extension) is undecided, and it leaves [ADR-0004](./0004-hybrid-rule-sync.md) and [ADR-0005](./0005-invite-only-membership.md)'s "no anonymous read" stale.
