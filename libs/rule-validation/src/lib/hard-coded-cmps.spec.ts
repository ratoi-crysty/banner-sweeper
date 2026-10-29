import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { HARD_CODED_CMP_NAMES } from './hard-coded-cmps.js';

// autoconsent ships its TS source, and lib/cmps/all.ts lists the CMPs it implements in code
function upstreamHardCodedCmpNames(): string[] {
  const require: NodeJS.Require = createRequire(import.meta.url);
  const cmpsDir: string = path.join(
    path.dirname(require.resolve('@duckduckgo/autoconsent')),
    '../lib/cmps',
  );
  const all: string = readFileSync(path.join(cmpsDir, 'all.ts'), 'utf8');
  return [...all.matchAll(/^import \w+ from '\.\/([\w-]+)';$/gm)].map(
    ([, file]: RegExpExecArray): string => {
      const source: string = readFileSync(
        path.join(cmpsDir, `${file}.ts`),
        'utf8',
      );
      const name: string | undefined = /^\s+name = '([^']+)';$/m.exec(
        source,
      )?.[1];
      if (name === undefined) {
        throw new Error(`No CMP name found in lib/cmps/${file}.ts`);
      }
      return name;
    },
  );
}

describe('HARD_CODED_CMP_NAMES', () => {
  it("matches the pinned autoconsent's hard-coded CMPs", () => {
    expect(HARD_CODED_CMP_NAMES).toEqual(upstreamHardCodedCmpNames());
  });

  it('has the 11 hard-coded CMPs', () => {
    expect(HARD_CODED_CMP_NAMES).toHaveLength(11);
  });
});
