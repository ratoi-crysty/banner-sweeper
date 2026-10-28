# Detection test set: screening

How [`../sites.json`](../sites.json) was built, for [Build the Detection test set](https://github.com/ratoi-crysty/banner-sweeper/issues/12). Rerun it to refresh the set or find replacements when a Site changes.

- `candidates.mjs`: picks candidates from the Tranco top list. These are EU country domains ranked 1k–40k, interleaved by TLD, with a fixed seed. Its output is `candidates.txt` (718 domains; the first 250 were screened).
- `screen.mjs`: screens a slice of candidates. A look pass (no autoconsent) finds a banner and takes a screenshot. A stock pass (the extension's exact autoconsent config) then checks Decline, persistence and reload. Results are appended to `results.jsonl`.
- `manual.mjs`: clicks a button by its visible text, reloads, and reports whether the banner returns. It's used to check whether a refusal can persist at all.
- `review.json`: the verdict on each miss after reviewing its screenshot (`include`, `reserve` or `excluded` with a reason). Included and reserve Sites are in `sites.json`, with their screenshots in `../shots/`.

Run, from a folder with `playwright-core@1.64.1` installed (it must match the server's major.minor):

```bash
node screen.mjs <repoRoot> candidates.txt <from> <count> <outDir>   # PLAYWRIGHT_WS defaults to ws://localhost:8080/
```

The browser is the local Docker `mcr.microsoft.com/playwright:v1.64.1-noble`, exiting from Romania, with an `en-GB` locale, the `Europe/Bucharest` timezone, a 1280×800 viewport and a normal Chrome UA.

## `sites.json`

One entry per Site: `url`, `status` (`active`, or `reserve` for a stand-in when an active Site changes), `cmp` if known, `bundledRuleMatched`, `missShape`, `bannerFrame`, `shadowDom`, banner `language`, a `note`, the `screenshot` and `capturedAt`.

`missShape` is one of:

- `noRuleMatched`: no Bundled Rule detected the banner;
- `cosmeticOnly`: only a cosmetic Bundled Rule hid it;
- `optOutClaimedBannerStays`: the Bundled Rule reports an opt-out, but the banner is still visible;
- `refusalNotStored`: the Bundled Rule Declines, but the banner comes back on reload;
- `settingsOnly`: refusing is only possible through the settings view.

Excluded from the set: pay-or-consent walls (refusing means paying), notice-only banners (only "OK" or "Accept"), bot-blocked Sites, adult Sites and false positives.
