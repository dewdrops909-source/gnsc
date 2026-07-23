import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as logic from '../src/logic.js';

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'),
  'utf8'
);

// Pull a single-line `function name(params) { body }` definition out of
// index.html and rebuild it as a callable function, so we can compare the
// deployed implementation against the tested one in src/logic.js.
function extractInline(name) {
  const line = html
    .split('\n')
    .find((l) => l.trim().startsWith('function ' + name + '('));
  if (!line) throw new Error('could not find inline function ' + name + '() in index.html');
  const params = line
    .slice(line.indexOf('(') + 1, line.indexOf(')'))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const body = line.slice(line.indexOf('{') + 1, line.lastIndexOf('}'));
  // eslint-disable-next-line no-new-func
  return new Function(...params, body);
}

const CASES = {
  t2m: ['', '00:00', '01:30', '23:59', '10:15:30', undefined, null],
  fmtM: [0, -5, 45, 59, 60, 90, 125, undefined],
  esc: ['<script>', 'a & b', 'say "hi"', '&lt;', '', null, undefined, 'plain'],
  validVNum: ['MH12AB1234', 'mh12ab1234', 'MH 12 AB 1234', 'KA5M9999', '', '1234', 'MHAB1234', 'MH12AB123', 'MH12ABCD'],
};

describe('index.html pure utilities match src/logic.js (anti-drift)', () => {
  for (const name of Object.keys(CASES)) {
    it(`${name}() behaves identically`, () => {
      const inline = extractInline(name);
      for (const input of CASES[name]) {
        expect(inline(input), `mismatch for ${name}(${JSON.stringify(input)})`).toBe(
          logic[name](input)
        );
      }
    });
  }
});
