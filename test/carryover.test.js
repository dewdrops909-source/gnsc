import { describe, it, expect } from 'vitest';
import {
  etaOverdueToday,
  isOldByResetTs,
  shouldMarkCarryOverVehicle,
  shouldMarkCarryOverRoute,
  isValidResetTs,
  clampResetTs,
  adoptResetTs,
} from '../src/logic.js';

const D = (s) => new Date(s);

describe('etaOverdueToday', () => {
  it('is false when there is no ETA', () => {
    expect(etaOverdueToday('', 600, 0, D('2026-07-23T10:00:00'))).toBe(false);
  });
  it('is false at or before the ETA', () => {
    expect(etaOverdueToday('10:00', 540, 0, D('2026-07-23T09:00:00'))).toBe(false);
    expect(etaOverdueToday('10:00', 600, 0, D('2026-07-23T10:00:00'))).toBe(false);
  });
  it('is true after the ETA when no reset has run', () => {
    expect(etaOverdueToday('10:00', 700, 0, D('2026-07-23T11:40:00'))).toBe(true);
  });
  it('late-night guard: an ETA before a same-day reset is NOT overdue', () => {
    const resetTs = D('2026-07-23T02:00:00').getTime();
    expect(etaOverdueToday('01:00', 300, resetTs, D('2026-07-23T05:00:00'))).toBe(false);
  });
  it('still overdue if the ETA is after the same-day reset', () => {
    const resetTs = D('2026-07-23T02:00:00').getTime();
    expect(etaOverdueToday('03:00', 300, resetTs, D('2026-07-23T05:00:00'))).toBe(true);
  });
});

// Carry-over is bounded by the last "Start New Day" (resetTs), NOT the calendar.
describe('isOldByResetTs (carry-over core)', () => {
  it('is true when createdAt precedes the reset boundary', () => {
    expect(isOldByResetTs(500, 1000)).toBe(true);
  });
  it('is false at or after the boundary — the current working day', () => {
    expect(isOldByResetTs(1000, 1000)).toBe(false);
    expect(isOldByResetTs(1500, 1000)).toBe(false);
  });
  it('is false for unknown createdAt or no reset boundary', () => {
    expect(isOldByResetTs(0, 1000)).toBe(false);
    expect(isOldByResetTs(undefined, 1000)).toBe(false);
    expect(isOldByResetTs(500, 0)).toBe(false);
  });
  it('an item created AFTER the reset stays "today" even past midnight', () => {
    // reset pressed last night 21:15; route created 22:15 (after). Next morning it is
    // still today's — createdAt >= resetTs.
    const reset = D('2026-07-27T21:15:00').getTime();
    const created = D('2026-07-27T22:15:00').getTime();
    expect(isOldByResetTs(created, reset)).toBe(false);
  });
  it('the same route becomes a carry-over only once the NEXT reset is pressed', () => {
    const created = D('2026-07-27T22:15:00').getTime();
    const nextReset = D('2026-07-28T09:00:00').getTime();
    expect(isOldByResetTs(created, nextReset)).toBe(true);
  });
});

describe('shouldMarkCarryOverVehicle', () => {
  const RESET = 1000;
  it('flags an old, route-linked, non-departed vehicle', () => {
    expect(shouldMarkCarryOverVehicle({ createdAt: 500, routeId: 'r1', status: 'planned' }, RESET)).toBe(true);
  });
  it('never flags a pool vehicle (no route)', () => {
    expect(shouldMarkCarryOverVehicle({ createdAt: 500, routeId: null, status: 'planned' }, RESET)).toBe(false);
  });
  it('never flags a departed or already-flagged vehicle', () => {
    expect(shouldMarkCarryOverVehicle({ createdAt: 500, routeId: 'r1', status: 'out' }, RESET)).toBe(false);
    expect(shouldMarkCarryOverVehicle({ createdAt: 500, routeId: 'r1', status: 'planned', isCarryOver: true }, RESET)).toBe(false);
  });
  it('never flags an item created after the reset — regardless of calendar date', () => {
    // created after RESET but dated "yesterday" (night-before upload): still today's.
    expect(shouldMarkCarryOverVehicle({ createdAt: 1500, routeId: 'r1', status: 'planned', date: '2026-07-27' }, RESET)).toBe(false);
  });
});

describe('shouldMarkCarryOverRoute', () => {
  const RESET = 1000;
  it('flags an old, non-departed route', () => {
    expect(shouldMarkCarryOverRoute({ createdAt: 500, status: 'short' }, RESET, { status: 'planned' })).toBe(true);
  });
  it('is not flagged when its assigned vehicle has departed', () => {
    expect(shouldMarkCarryOverRoute({ createdAt: 500, status: 'short' }, RESET, { status: 'out' })).toBe(false);
  });
  it('is not flagged when created after the reset', () => {
    expect(shouldMarkCarryOverRoute({ createdAt: 1500, status: 'short' }, RESET, null)).toBe(false);
  });
});

// RESET_TS must never be in the future — that is the clock-poison that turns fresh
// uploads into false carry-overs.
describe('RESET_TS integrity', () => {
  const NOW = 1_000_000;

  it('isValidResetTs accepts a positive non-future value', () => {
    expect(isValidResetTs(999_000, NOW)).toBe(true);
    expect(isValidResetTs(NOW, NOW)).toBe(true);
    expect(isValidResetTs(0, NOW)).toBe(false);
    expect(isValidResetTs(NOW + 1, NOW)).toBe(false); // future = invalid
  });

  it('clampResetTs discards a future (poisoned) value to 0, keeps valid ones', () => {
    expect(clampResetTs(NOW + 60_000, NOW)).toBe(0);   // 1 min in the future → poison
    expect(clampResetTs(999_000, NOW)).toBe(999_000);  // valid → unchanged
    expect(clampResetTs(0, NOW)).toBe(0);
  });

  it('adoptResetTs takes a valid newer value', () => {
    expect(adoptResetTs(500_000, 900_000, NOW)).toBe(900_000);
  });
  it('adoptResetTs rejects a future (poisoned) incoming value', () => {
    expect(adoptResetTs(500_000, NOW + 100_000, NOW)).toBe(500_000);
  });
  it('adoptResetTs keeps ours when incoming is older', () => {
    expect(adoptResetTs(900_000, 500_000, NOW)).toBe(900_000);
  });
  it('adoptResetTs replaces our OWN poisoned value with a valid lower one (cross-device flush)', () => {
    // our stored RESET_TS is in the future; a valid value from another device must win
    const poisoned = NOW + 500_000;
    expect(adoptResetTs(poisoned, 800_000, NOW)).toBe(800_000);
  });
  it('adoptResetTs ignores a missing incoming value', () => {
    expect(adoptResetTs(500_000, 0, NOW)).toBe(500_000);
    expect(adoptResetTs(500_000, undefined, NOW)).toBe(500_000);
  });
});
