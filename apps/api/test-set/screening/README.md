# Detection test set: screening (work in progress)

Working files for [Build the Detection test set](https://github.com/ratoi-crysty/banner-sweeper/issues/12). The final list (`apps/api/test-set/sites.json`) doesn't exist yet.

- `candidates.mjs`: picks candidates from the Tranco top list. These are EU country domains ranked 1k–40k, interleaved by TLD, with a fixed seed. Its output is `candidates.txt` (718 domains).
- `screen.mjs`: screens a slice of candidates. A look pass (no autoconsent) finds a banner and takes a screenshot. A stock pass (the extension's exact autoconsent config) then checks Decline, persistence and reload. Results are appended to `results.jsonl`.
- `manual.mjs`: clicks a button by its visible text, reloads, and reports whether the banner returns. It's used to check whether a refusal can persist at all.
- `review.json`: the verdict on each miss after reviewing its screenshot (`include`, `reserve` or `excluded` with a reason).
- `shots/`: look-pass screenshots for included and reserve Sites only.

Run, from a folder with `playwright-core@1.64.1` installed (it must match the server's major.minor):

```bash
node screen.mjs <repoRoot> candidates.txt <from> <count> <outDir>   # PLAYWRIGHT_WS defaults to ws://localhost:8080/
```
