# Banner Sweeper

A browser extension, backed by a closed-membership service, that declines consent banners and removes overlays that hide content a page has already delivered.

- [`CONTEXT.md`](./CONTEXT.md): the project's vocabulary (Obstruction, Rule, Step, Draft, …)
- [`docs/adr/`](./docs/adr/): architecture decisions

## Repository layout

| Project                              | Path                      | What it is                                                                                                    |
| ------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `@banner-sweeper/extension`          | `apps/extension`          | Chrome MV3 extension (React + Vite + CRXJS)                                                                   |
| `@banner-sweeper/api`                | `apps/api`                | NestJS API                                                                                                    |
| `@banner-sweeper/web`                | `apps/web`                | Admin panel (React + Vite)                                                                                    |
| `@banner-sweeper/api-interfaces`     | `libs/api-interfaces`     | Shared types, including the Rule protocol                                                                     |
| `@banner-sweeper/autoconsent-config` | `libs/autoconsent-config` | The extension's autoconsent config and per-frame Bundled Rules, shared with Detection's stock check           |
| `@banner-sweeper/llm-backend`        | `libs/llm-backend`        | The neutral types on the seam between Detection and an LLM (`DetectionBackend`, tools, turn events, outcomes) |

## Extension

### Current status

The extension is still the CRXJS starter: it does not apply any Rules yet. Once loaded, it provides:

- **Popup**: click the extension's toolbar icon. Shows the starter "Vite + React + CRXJS" page.
- **Side panel**: open Chrome's side panel and select the extension. Shows the same starter page.
- **Content script**: runs on every `https://` page, logs `[CRXJS] Hello world from content script!` to the page's console, and adds a floating button in the bottom-right corner that toggles a "HELLO CRXJS" box.

Permissions requested so far: `sidePanel`, `contentSettings`.

### Prerequisites

- Chrome, or another Chromium-based browser
- Dependencies installed from the repo root:

```sh
pnpm install
```

### Develop

1. Start the dev server from the repo root:

   ```sh
   npx nx dev @banner-sweeper/extension
   ```

   CRXJS writes a development build to `apps/extension/dist` and prints `Load dist as unpacked extension`.

2. In Chrome, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select `apps/extension/dist`.

3. Keep the dev server running. Changes to the popup, side panel and content script hot-reload. After changing `manifest.config.ts`, click the reload icon on the extension's card in `chrome://extensions`.

The development build loads its code from the dev server, so it stops working when the dev server is stopped. Use a production build to run the extension on its own.

### Production build

```sh
npx nx build @banner-sweeper/extension
```

This type-checks (`tsc -b`), then writes a self-contained build to `apps/extension/dist`, which you can load unpacked the same way, and packs it as `apps/extension/release/crx-banner-sweeper-extension-<version>.zip` for distribution.

## Tests

Tests run on [Vitest](https://vitest.dev/) and are named `*.spec.ts` next to the code they cover. The `test` target runs once and exits:

```sh
npx nx test @banner-sweeper/api      # one project
npx nx run-many -t test              # every project with tests
```

Libraries generated with `@nx/js`, `@nx/node`, `@nx/nest` or `@nx/react` get a `test` target by default (set in `nx.json`'s `generators`). To add one to a project that has none:

```sh
npx nx g @nx/vitest:configuration --project=<project> --testEnvironment=node
```

For a NestJS project, also set `experimentalDecorators` and `emitDecoratorMetadata` in its `tsconfig.spec.json`, as `apps/api` does. Without them Nest's dependency injection resolves constructor parameters as `undefined`.

## LLM backends

Detection talks to an LLM through a `DetectionBackend` (ADR-0009). The backends are named in the checked-in [`apps/api/config/llm-backends.json`](./apps/api/config/llm-backends.json), which holds no secrets and is validated when the API boots. `DETECTION_BACKEND=<id>` picks one; the default is `claude-opus` (`claude-opus-5-5` at effort `medium`).

A Claude backend finds its credentials the way the Anthropic SDK does (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, or an `ant auth login` profile), unless its entry names another env var in `apiKeyEnv`.

One test runs a toy tool loop against the real API. It is skipped unless you opt in, because it costs money:

```sh
LIVE_LLM_TEST=1 npx nx test @banner-sweeper/api -- claude-backend.live
```

## Pinned dependencies

| Package                   | Pin               | Why                                                                                                                                                                                                                                         |
| ------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `playwright-core`         | `~1.64.1`         | Detection drives the `mcr.microsoft.com/playwright:v1.64.1-noble` browser through `chromium.connect()`, which refuses a server whose major.minor differs from the client's. Upgrade the package and the image together.                     |
| `@duckduckgo/autoconsent` | `16.60.0` (exact) | Detection depends on its rule format, its Bundled Rules and its injected bundle. On every upgrade, recheck the 11 CMP names Detection puts in `disabledCmps` for candidate runs, and the generated rule schema.                             |
| `@anthropic-ai/sdk`       | `1.3.0` (exact)   | The LLM backends run on its beta Tool Runner and rely on how it runs a turn's tool calls (all at once, in the model's order: `SequentialTools` turns that into one at a time). On every upgrade, rerun the backend tests and the live test. |

## Nx workspace

<a alt="Nx logo" href="https://nx.dev" target="_blank" rel="noreferrer"><img src="https://raw.githubusercontent.com/nrwl/nx/master/images/nx-logo.png" width="45"></a>

This is an [Nx workspace](https://nx.dev). Run `npx nx graph` to explore the projects and their dependencies.

## Run tasks

To run the dev server for your app, use:

```sh
npx nx serve api
```

To create a production bundle:

```sh
npx nx build api
```

To see all available targets to run for a project, run:

```sh
npx nx show project api
```

These targets are either [inferred automatically](https://nx.dev/concepts/inferred-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) or defined in the `project.json` or `package.json` files.

[More about running tasks in the docs &raquo;](https://nx.dev/features/run-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Add new projects

While you could add new projects to your workspace manually, you might want to leverage [Nx plugins](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) and their [code generation](https://nx.dev/features/generate-code?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) feature.

Use the plugin's generator to create new projects.

To generate a new application, use:

```sh
npx nx g @nx/node:app demo
```

To generate a new library, use:

```sh
npx nx g @nx/node:lib mylib
```

You can use `npx nx list` to get a list of installed plugins. Then, run `npx nx list <plugin-name>` to learn about more specific capabilities of a particular plugin. Alternatively, [install Nx Console](https://nx.dev/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) to browse plugins and generators in your IDE.

[Learn more about Nx plugins &raquo;](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) | [Browse the plugin registry &raquo;](https://nx.dev/plugin-registry?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Set up CI!

### Step 1

To connect to Nx Cloud, run the following command:

```sh
npx nx connect
```

Connecting to Nx Cloud ensures a [fast and scalable CI](https://nx.dev/ci/intro/why-nx-cloud?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects) pipeline. It includes features such as:

- [Remote caching](https://nx.dev/ci/features/remote-cache?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Task distribution across multiple machines](https://nx.dev/ci/features/distribute-task-execution?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Automated e2e test splitting](https://nx.dev/ci/features/split-e2e-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Task flakiness detection and rerunning](https://nx.dev/ci/features/flaky-tasks?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

### Step 2

Use the following command to configure a CI workflow for your workspace:

```sh
npx nx g ci-workflow
```

[Learn more about Nx on CI](https://nx.dev/ci/intro/ci-with-nx#ready-get-started-with-your-provider?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Install Nx Console

Nx Console is an editor extension that enriches your developer experience. It lets you run tasks, generate code, and improves code autocompletion in your IDE. It is available for VSCode and IntelliJ.

[Install Nx Console &raquo;](https://nx.dev/getting-started/editor-setup?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

## Useful links

Learn more:

- [Learn more about this workspace setup](https://nx.dev/nx-api/node?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Learn about Nx on CI](https://nx.dev/ci/intro/ci-with-nx?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [Releasing Packages with Nx release](https://nx.dev/features/manage-releases?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
- [What are Nx plugins?](https://nx.dev/concepts/nx-plugins?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)

And join the Nx community:

- [Discord](https://go.nx.dev/community)
- [Follow us on X](https://twitter.com/nxdevtools) or [LinkedIn](https://www.linkedin.com/company/nrwl)
- [Our Youtube channel](https://www.youtube.com/@nxdevtools)
- [Our blog](https://nx.dev/blog?utm_source=nx_project&utm_medium=readme&utm_campaign=nx_projects)
