# api

The Banner Sweeper service. For now it runs Detection's stock check over HTTP: `POST /api/detections` with a URL (and an optional Hint) queues a job, and `GET /api/detections/:id` shows it move from `queued` to `running` (phase `stockCheck`) to `finished`. The job runs stock autoconsent (the Bundled Rules plus our Published Rules, with the extension's exact config) and ends `covered` when those Rules Decline the banner. Until the Detection agent exists, any other Site ends as `error`.

The OpenAPI docs are served at `/api/docs`.

## The browser server

Detection drives a remote Chromium through Playwright's `connect()`, which only works when the client and server share a major.minor version. `playwright-core` is pinned to 1.64, so run the matching image:

```bash
docker run -d --rm --name playwright -p 8080:8080 --init --ipc=host \
  mcr.microsoft.com/playwright:v1.64.1-noble \
  /bin/sh -c "npx -y playwright-core@1.64.1 run-server --port 8080 --host 0.0.0.0"
```

When you upgrade `playwright-core`, upgrade this image to the same version.

The server launches a browser per connection. By default that's Chromium's stripped-down headless shell, so the API asks for full Chromium in its new headless mode instead (`channel: 'chromium'`, sent as launch options when it connects). That's the browser users run, with the same site isolation, and harder for bot checks to tell apart. The image already includes it.

## Configuration

| Variable                | Default                    | What it sets                                                                       |
| ----------------------- | -------------------------- | ---------------------------------------------------------------------------------- |
| `PLAYWRIGHT_HOST`       | `ws://localhost:8080/`     | The browser server's WebSocket endpoint                                            |
| `DATABASE_PATH`         | `apps/api/data/api.sqlite` | The SQLite database. Migrations run on boot, and the schema is never synchronised. |
| `DETECTION_CONCURRENCY` | `1`                        | How many Detection jobs run at once                                                |
| `BROWSER_LOCALE`        | `en-GB`                    | The browser's locale, a language tag                                               |
| `BROWSER_TIMEZONE`      | `Europe/Bucharest`         | The browser's timezone, an IANA name                                               |
| `PORT`                  | `3000`                     | The HTTP port                                                                      |

Sites mostly pick the banner by the visitor's IP, so set `BROWSER_LOCALE` and `BROWSER_TIMEZONE` to match where the browser server's traffic exits: a mismatch can look like a bot or change the banner. The test set was captured with the defaults.

`apps/api/data/` is gitignored. The variables can also go in a `.env` file in the directory you start the API from (the repository root for `nx serve`); `.env` is gitignored, and real environment variables win over it.

## Running

```bash
npx nx serve @banner-sweeper/api
```

## Tests

```bash
npx nx test @banner-sweeper/api
```

Two suites need the browser server and are skipped unless `PLAYWRIGHT_HOST` is set:

- `src/app/browser/isolated-world.spec.ts` checks the isolated-world bridge on local pages served by routing, so it doesn't need the internet. It runs on both full Chromium, which the API uses and which gives cross-site iframes their own process, and the server's default headless shell, which keeps them in the page's process.
- The live tests in `src/app/detection/detection.controller.live.spec.ts` drive real Sites from the test set (`test-set/`). They need the internet.

```bash
PLAYWRIGHT_HOST=ws://localhost:8080/ npx nx test @banner-sweeper/api
```

The Covered Site comes from `test-set/screening/results.jsonl`, because `sites.json` only holds Sites that the Bundled Rules miss. The not-Covered Site is the cosmetic-only `shoprenter.hu` from `sites.json`.

Sites change, so a live test that fails may mean the Site drifted rather than the code. Rescreen it with `test-set/screening/`.
