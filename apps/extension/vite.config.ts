import path from 'node:path';
import { crx } from '@crxjs/vite-plugin';
import react from '@vitejs/plugin-react';
import { defineConfig, PluginOption } from 'vite';
import zipPack, { Options } from 'vite-plugin-zip-pack';
import manifest from './manifest.config.js';
import packageJson from './package.json' with { type: 'json' };

// TODO: Investigate this TS issue
const zip = zipPack as unknown as (options?: Options) => PluginOption;

// `@banner-sweeper/extension` -> `banner-sweeper-extension`: the scope's `/` would otherwise be a path separator
const zipName: string = packageJson.name.replace(/^@/, '').replace(/\//g, '-');

export default defineConfig({
  resolve: {
    alias: {
      '@': `${path.resolve(__dirname, 'src')}`,
    },
  },
  plugins: [
    react(),
    crx({ manifest }),
    zip({ outDir: 'release', outFileName: `crx-${zipName}-${packageJson.version}.zip` }),
  ],
  server: {
    cors: {
      origin: [/chrome-extension:\/\//],
    },
  },
});
