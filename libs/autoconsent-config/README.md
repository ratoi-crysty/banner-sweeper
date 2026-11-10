# autoconsent-config

The autoconsent setup the extension runs with, shared so that Detection's stock check runs exactly the same one:

- `autoconsentConfig`: the `Config` sent in every `initResp`. It Declines (`autoAction: 'optOut'`) and never runs heuristic detection.
- `compactRulesForFrame({ url, mainFrame })`: the Bundled Rules (compact form) that apply to one frame, filtered by its URL and whether it is the top frame.

Its only dependency is `@duckduckgo/autoconsent`, pinned in the root `package.json`.

## Running unit tests

Run `npx nx test @banner-sweeper/autoconsent-config` to execute the unit tests via [Vitest](https://vitest.dev/).
