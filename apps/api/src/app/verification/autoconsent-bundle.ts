import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

let bundle: string | null = null;

/**
 * autoconsent's Playwright content script. It isn't in the package's `exports`, so it is found
 * by file path next to the package's main entry.
 */
export function autoconsentBundle(): string {
  if (bundle === null) {
    const distDir: string = dirname(
      createRequire(__filename).resolve('@duckduckgo/autoconsent'),
    );
    bundle = readFileSync(join(distDir, 'autoconsent.playwright.js'), 'utf8');
  }

  return bundle;
}
