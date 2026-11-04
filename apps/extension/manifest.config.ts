import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

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
  host_permissions: ['http://*/*', 'https://*/*'],
  // Matches how the API's stock check runs autoconsent: every frame, from the start of each document,
  // because many banners live in an iframe and some show before the page is idle
  content_scripts: [
    {
      js: ['src/content/main.tsx'],
      matches: ['http://*/*', 'https://*/*'],
      all_frames: true,
      match_about_blank: true,
      run_at: 'document_start',
    },
  ],
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
});
