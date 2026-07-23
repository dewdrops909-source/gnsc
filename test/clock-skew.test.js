import { describe, it, expect } from 'vitest';
import {
  computeServerNow,
  clampHighWaterMark,
  syncDecision,
  isNotifFresh,
} from '../src/logic.js';

describe('computeServerNow', () => {
  it('adds the server offset to local time', () => {
    expect(computeServerNow(1000, 500)).toBe(1500);
    expect(computeServerNow(1000, -500)).toBe(500);
    expect(computeServerNow(1000, 0)).toBe(1000);
  });
  it('treats a missing offset as zero', () => {
    expect(computeServerNow(1000)).toBe(1000);
    expect(computeServerNow(1000, undefined)).toBe(1000);
  });
});

describe('clampHighWaterMark', () => {
  it('leaves a valid (past-or-present) mark untouched', () => {
    expect(clampHighWaterMark(1000, 2000)).toBe(1000);
    expect(clampHighWaterMark(2000, 2000)).toBe(2000);
  });
  it('clamps a future (clock-poisoned) mark down to server-now', () => {
    const poisoned = 2000 + 10 * 60 * 1000; // 10 min ahead
    expect(clampHighWaterMark(poisoned, 2000)).toBe(2000);
  });
});

describe('syncDecision guards', () => {
  const base = { ver: 13, ts: 1000, routes: [{}], vehicles: [] };

  it('accepts a normal newer snapshot', () => {
    expect(syncDecision(base, { myDataTs: 500, appVer: 13 }).accept).toBe(true);
  });
  it('accepts equal timestamps (only strictly-older is rejected)', () => {
    expect(syncDecision({ ...base, ts: 500 }, { myDataTs: 500, appVer: 13 }).accept).toBe(true);
  });
  it('GUARD 2: rejects older app versions', () => {
    const d = syncDecision({ ...base, ver: 12 }, { myDataTs: 0, appVer: 13 });
    expect(d.accept).toBe(false);
    expect(d.reason).toMatch(/old version/);
  });
  it('GUARD 3: rejects data older than the high-water mark', () => {
    const d = syncDecision({ ...base, ts: 400 }, { myDataTs: 500, appVer: 13 });
    expect(d.accept).toBe(false);
    expect(d.reason).toMatch(/older data/);
  });
  it('GUARD 4: rejects empty non-deliberate snapshots', () => {
    const d = syncDecision(
      { ver: 13, ts: 1000, routes: [], vehicles: [] },
      { myDataTs: 0, appVer: 13 }
    );
    expect(d.accept).toBe(false);
    expect(d.reason).toMatch(/empty/);
  });
  it('GUARD 4: accepts an empty deliberate clear', () => {
    const d = syncDecision(
      { ver: 13, ts: 1000, routes: [], vehicles: [], deliberateClear: true },
      { myDataTs: 0, appVer: 13 }
    );
    expect(d.accept).toBe(true);
  });
  it('accepts a snapshot that has vehicles but no routes', () => {
    const d = syncDecision(
      { ver: 13, ts: 1000, routes: [], vehicles: [{}] },
      { myDataTs: 0, appVer: 13 }
    );
    expect(d.accept).toBe(true);
  });
  it('returns a non-accept for a null snapshot', () => {
    expect(syncDecision(null, { myDataTs: 0, appVer: 13 }).accept).toBe(false);
  });
});

describe('regression: client clock skew must not reject valid data', () => {
  const TEN_MIN = 10 * 60 * 1000;

  it('server-corrected timestamps stay correctly ordered across skewed clocks', () => {
    const serverBase = 1_000_000;
    // Device A: local clock +10 min, offset -10 min → serverNow ≈ serverBase
    const aServerNow = computeServerNow(serverBase + TEN_MIN, -TEN_MIN);
    // Device B: accurate clock, saved 1s later
    const bServerNow = computeServerNow(serverBase + 1000, 0);

    expect(aServerNow).toBe(serverBase);
    expect(bServerNow).toBeGreaterThan(aServerNow);

    // B's save is genuinely newer, so A must accept it.
    const decision = syncDecision(
      { ver: 13, ts: bServerNow, routes: [{}], vehicles: [] },
      { myDataTs: aServerNow, appVer: 13 }
    );
    expect(decision.accept).toBe(true);
  });

  it('a poisoned high-water mark self-heals so honest updates flow again', () => {
    const serverNowVal = 2_000_000;
    const poisoned = serverNowVal + TEN_MIN; // stuck 10 min in the future
    const honest = serverNowVal + 5000;      // a legit update, stamped just after now

    // While poisoned, GUARD 3 would reject the honest update...
    expect(
      syncDecision(
        { ver: 13, ts: honest, routes: [{}], vehicles: [] },
        { myDataTs: poisoned, appVer: 13 }
      ).accept
    ).toBe(false);

    // ...after clamping the mark back to server-now, it's accepted.
    const healed = clampHighWaterMark(poisoned, serverNowVal);
    expect(
      syncDecision(
        { ver: 13, ts: honest, routes: [{}], vehicles: [] },
        { myDataTs: healed, appVer: 13 }
      ).accept
    ).toBe(true);
  });
});

describe('isNotifFresh', () => {
  it('accepts a notification within the window', () => {
    expect(isNotifFresh(1000, 1005, 10000)).toBe(true);
    expect(isNotifFresh(1000, 10999, 10000)).toBe(true);
  });
  it('rejects a notification at/beyond the window edge', () => {
    expect(isNotifFresh(1000, 11000, 10000)).toBe(false);
    expect(isNotifFresh(1000, 20000, 10000)).toBe(false);
  });
  it('with both sides on the server clock, a 3s-old notification is fresh', () => {
    const sent = 100000;
    expect(isNotifFresh(sent, sent + 3000)).toBe(true);
  });
});
