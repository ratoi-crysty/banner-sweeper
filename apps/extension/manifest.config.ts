import { defineManifest } from '@crxjs/vite-plugin'
import pkg from './package.json'

export default defineManifest({
  manifest_version: 3,
  name: 'Banner Sweeper',
  description: pkg.description,
  version: pkg.version,
  icons: {
    128: 'public/icon-128.png',
    64: 'public/icon-64.png',
    48: 'public/icon-48.png',
    32: 'public/icon-32.png',
    16: 'public/icon-16.png',
  },
  action: {
    default_icon: {
      128: 'public/icon-128.png',
      64: 'public/icon-64.png',
      48: 'public/icon-48.png',
      32: 'public/icon-32.png',
      16: 'public/icon-16.png',
    },
    default_popup: 'src/popup/index.html',
  },
  background: {
    service_worker: 'src/background/main.ts',
    type: 'module',
  },
  permissions: ['sidePanel', 'contentSettings', 'scripting'],
  // needed by `chrome.scripting.executeScript` to run autoconsent snippets in the page
  host_permissions: ['https://*/*'],
  content_scripts: [
    {
      js: ['src/content/main.tsx'],
      matches: ['https://*/*'],
    },
  ],
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
});
