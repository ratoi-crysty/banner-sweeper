import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

let bundle: Promise<string> | undefined;

/**
 * autoconsent's Playwright content script. It isn't in the package's `exports`, so it is found
 * by file path next to the package's main entry.
 */
export function getAutoconsentBundle(): Promise<string> {
  if (bundle === undefined) {
    const distDir: string = dirname(
      createRequire(__filename).resolve('@duckduckgo/autoconsent'),
    );
    bundle = readFile(join(distDir, 'autoconsent.playwright.js'), 'utf8');
  }

  return bundle;
}
