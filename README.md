# Banner Sweeper

A browser extension, backed by a closed-membership service, that declines consent banners and removes overlays that hide content a page has already delivered.

- [`CONTEXT.md`](./CONTEXT.md): the project's vocabulary (Obstruction, Rule, Step, Draft, …)
- [`docs/adr/`](./docs/adr/): architecture decisions

## Repository layout

| Project                          | Path                  | What it is                                  |
| -------------------------------- | --------------------- | ------------------------------------------- |
| `@banner-sweeper/extension`      | `apps/extension`      | Chrome MV3 extension (React + Vite + CRXJS) |
| `@banner-sweeper/api`            | `apps/api`            | NestJS API                                  |
| `@banner-sweeper/web`            | `apps/web`            | Admin panel (React + Vite)                  |
| `@banner-sweeper/api-interfaces` | `libs/api-interfaces` | Shared types, including the Rule protocol   |

## Extension

### Current status

The extension is still the CRXJS starter: it does not apply any Rules yet. Once loaded, it provides:

- **Popup**: click the extension's toolbar icon. Shows the starter "Vite + React + CRXJS" page.
- **Side panel**: open Chrome's side panel and select the extension. Shows the same starter page.
- **Content script**: runs on every `https://` page, logs `[CRXJS] Hello world from content script!` to the page's console, and adds a floating button in the bottom-right corner that toggles a "HELLO CRXJS" box.

Permissions requested so far: `sidePanel`, `contentSettings`.

### Prerequisites

- Node.js and the repo's pinned Yarn 1 (`.yarn/releases/yarn-1.22.22.cjs`, picked up automatically via `.yarnrc`)
- Chrome, or another Chromium-based browser
- Dependencies installed from the repo root:

```sh
yarn install
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
