---
status: amended by ADR-0007 (our Rules are autoconsent rules too)
---

# Consent Banners from known CMPs are handled by DuckDuckGo autoconsent

The extension embeds [`@duckduckgo/autoconsent`](https://github.com/duckduckgo/autoconsent) (MPL-2.0) with its bundled rules to Decline Consent Banners from known CMPs. Our own Rules and executor cover everything else: Content Overlays, Scroll Locks, and Sites whose banners autoconsent does not handle. A handful of CMPs cover most of the web and autoconsent already maintains declarative, Decline-oriented rules for them; rebuilding that is a large ongoing cost with no differentiation.

## Considered Options

- **Convert autoconsent / Consent-O-Matic rules into our own protocol.** One executor, but we would own a fork of a fast-moving rule corpus and its CMP-specific edge cases.
- **Write everything ourselves.** Rejected: months of work to reach parity.

## Consequences

- Two layers run in the content script, in order: autoconsent first, then our executor for whatever is still present. Both report outcomes so a Breakage Report can say which layer failed.
- autoconsent's rules ship inside the extension, so Consent Banners on known CMPs are Declined even when the Member is logged out or the API is unreachable.
- Before adopting a version, confirm its `eval`-type rules only reference snippets bundled in the library (not strings from rule data), to stay consistent with [ADR-0002](./0002-declarative-rule-protocol.md).
- MPL-2.0 is file-level copyleft: modifications to autoconsent's own files must be published; depending on it as a package is fine.
