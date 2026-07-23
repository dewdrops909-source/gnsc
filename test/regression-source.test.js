import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const html = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'),
  'utf8'
);

// These lock the three clock-skew fixes (commits d35b764 / 9935d23 / e4f4ea1).
// They assert the deployed single-file app keeps routing every cross-device
// timestamp through serverNow(), so a future edit can't silently reintroduce
// the "throwing old data" bug.
describe('clock-skew regression locks in index.html', () => {
  it('serverNow() is defined in terms of the server offset', () => {
    expect(html).toMatch(/function serverNow\(\)\s*\{\s*return Date\.now\(\)\s*\+\s*_serverOffset;\s*\}/);
  });

  it('subscribes to Firebase .info/serverTimeOffset', () => {
    expect(html).toMatch(/\.info\/serverTimeOffset/);
  });

  it('self-heals a future high-water mark', () => {
    expect(html).toMatch(/Clamping future high-water mark/);
  });

  it('save() stamps live data with serverNow()', () => {
    expect(html).toMatch(/const _ts=serverNow\(\);/);
  });

  it('GUARD 3 still rejects data older than the high-water mark', () => {
    expect(html).toMatch(/d\.ts < _myDataTs/);
  });

  it('RESET_TS is stamped with serverNow()', () => {
    expect(html).toMatch(/RESET_TS = serverNow\(\);/);
  });

  it('every createdAt is stamped with serverNow(), never the raw local clock', () => {
    expect(html).not.toMatch(/createdAt:\s*Date\.now\(\)/);
    const count = (html.match(/createdAt:serverNow\(\)/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(10);
  });

  it('the startNewDay 12-hour guard uses serverNow()', () => {
    expect(html).toMatch(/serverNow\(\)-lastResetTs/);
  });

  it('push notifications are stamped and judged fresh on the server clock', () => {
    expect(html).toMatch(/ts: serverNow\(\)/);
    expect(html).toMatch(/n\.ts > serverNow\(\) - 10000/);
    expect(html).toMatch(/cutoff=serverNow\(\)-\(60\*60\*1000\)/);
  });
});
