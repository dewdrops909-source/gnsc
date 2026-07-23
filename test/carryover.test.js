import { describe, it, expect } from 'vitest';
import {
  etaOverdueToday,
  isOldByResetTs,
  shouldMarkCarryOverVehicle,
  shouldMarkCarryOverRoute,
} from '../src/logic.js';

const D = (s) => new Date(s);

describe('etaOverdueToday', () => {
  it('is false when there is no ETA', () => {
    expect(etaOverdueToday('', 600, 0, D('2026-07-23T10:00:00'))).toBe(false);
  });
  it('is false at or before the ETA', () => {
    // now 09:00 (540), eta 10:00 (600)
    expect(etaOverdueToday('10:00', 540, 0, D('2026-07-23T09:00:00'))).toBe(false);
    // now exactly at eta
    expect(etaOverdueToday('10:00', 600, 0, D('2026-07-23T10:00:00'))).toBe(false);
  });
  it('is true after the ETA when no reset has run', () => {
    expect(etaOverdueToday('10:00', 700, 0, D('2026-07-23T11:40:00'))).toBe(true);
  });
  it('late-night guard: an ETA before a same-day reset is NOT overdue', () => {
    // Start-New-Day ran today at 02:00 (120). eta 01:00 (60) < reset → next working day
    const resetTs = D('2026-07-23T02:00:00').getTime();
    expect(etaOverdueToday('01:00', 300, resetTs, D('2026-07-23T05:00:00'))).toBe(false);
  });
  it('still overdue if the ETA is after the same-day reset', () => {
    const resetTs = D('2026-07-23T02:00:00').getTime();
    // eta 03:00 (180) > reset (120) → this ETA belongs to today and is past
    expect(etaOverdueToday('03:00', 300, resetTs, D('2026-07-23T05:00:00'))).toBe(true);
  });
  it('reset on a different calendar day does not suppress overdue', () => {
    const resetTs = D('2026-07-22T02:00:00').getTime(); // yesterday
    expect(etaOverdueToday('01:00', 300, resetTs, D('2026-07-23T05:00:00'))).toBe(true);
  });
});

describe('isOldByResetTs', () => {
  it('is true when createdAt precedes the reset boundary', () => {
    expect(isOldByResetTs(500, 1000)).toBe(true);
  });
  it('is false when createdAt is at or after the boundary', () => {
    expect(isOldByResetTs(1000, 1000)).toBe(false);
    expect(isOldByResetTs(1500, 1000)).toBe(false);
  });
  it('is false for unknown createdAt or no reset yet', () => {
    expect(isOldByResetTs(0, 1000)).toBe(false);
    expect(isOldByResetTs(undefined, 1000)).toBe(false);
    expect(isOldByResetTs(500, 0)).toBe(false);
  });
});

describe('shouldMarkCarryOverVehicle', () => {
  const RESET = 1000;
  it('flags an old, route-linked, non-departed vehicle', () => {
    expect(
      shouldMarkCarryOverVehicle({ createdAt: 500, routeId: 'r1', status: 'planned' }, RESET)
    ).toBe(true);
  });
  it('never flags a pool vehicle (no route)', () => {
    expect(
      shouldMarkCarryOverVehicle({ createdAt: 500, routeId: null, status: 'planned' }, RESET)
    ).toBe(false);
  });
  it('never flags a departed vehicle', () => {
    expect(
      shouldMarkCarryOverVehicle({ createdAt: 500, routeId: 'r1', status: 'out' }, RESET)
    ).toBe(false);
  });
  it('never re-flags an already-flagged vehicle', () => {
    expect(
      shouldMarkCarryOverVehicle(
        { createdAt: 500, routeId: 'r1', status: 'planned', isCarryOver: true },
        RESET
      )
    ).toBe(false);
  });
  it("never flags today's data (created after reset)", () => {
    expect(
      shouldMarkCarryOverVehicle({ createdAt: 1500, routeId: 'r1', status: 'planned' }, RESET)
    ).toBe(false);
  });
});

describe('shouldMarkCarryOverRoute', () => {
  const RESET = 1000;
  it('flags an old, non-departed route', () => {
    expect(
      shouldMarkCarryOverRoute({ createdAt: 500, status: 'short' }, RESET, { status: 'planned' })
    ).toBe(true);
  });
  it('is not flagged when its assigned vehicle has departed', () => {
    expect(
      shouldMarkCarryOverRoute({ createdAt: 500, status: 'short' }, RESET, { status: 'out' })
    ).toBe(false);
  });
  it('is not flagged when the route itself is out', () => {
    expect(
      shouldMarkCarryOverRoute({ createdAt: 500, status: 'out' }, RESET, null)
    ).toBe(false);
  });
  it("is not flagged for today's data", () => {
    expect(
      shouldMarkCarryOverRoute({ createdAt: 1500, status: 'short' }, RESET, null)
    ).toBe(false);
  });
});
