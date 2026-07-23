// ─────────────────────────────────────────────────────────────────────────────
// GNSC — pure business logic, extracted for testing.
//
// These are dependency-free reimplementations of logic that currently lives
// inline in index.html. The app is deployed as a single self-contained
// index.html, so it does NOT import this module at runtime; instead:
//
//   • test/time.test.js, clock-skew.test.js, carryover.test.js  — verify the
//     behaviour of the functions below.
//   • test/parity.test.js       — extracts the matching one-liners from
//     index.html and asserts they behave identically to the versions here,
//     so the two copies cannot silently drift.
//   • test/regression-source.test.js — asserts index.html keeps routing every
//     cross-device timestamp through serverNow() (locks the clock-skew fixes).
//
// When you change a function here, change the matching one in index.html (and
// vice-versa); the parity/regression tests will fail loudly if you forget.
// ─────────────────────────────────────────────────────────────────────────────

// ── time helpers ────────────────────────────────────────────────────────────

/** "HH:MM" → minutes since midnight. Empty/falsey → 0. Ignores seconds. */
export function t2m(t) {
  if (!t) return 0;
  const p = (t || '').slice(0, 5).split(':');
  return +p[0] * 60 + +p[1];
}

/** minutes → "45m" or "1h 30m". Non-positive/empty → "0m". */
export function fmtM(m) {
  if (!m || m <= 0) return '0m';
  return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + (m % 60) + 'm';
}

/** HTML-escape a value (coerces nullish to ''). */
export function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Validate an Indian vehicle plate (case-insensitive, spaces ignored). */
export function validVNum(n) {
  return /^[A-Z]{2}[0-9]{1,2}[A-Z0-9]{1,4}[0-9]{4}$/.test(
    (n || '').toUpperCase().replace(/\s+/g, '')
  );
}

// ── clock-skew correction (commits d35b764 / 9935d23 / e4f4ea1) ──────────────
//
// Every timestamp used for cross-device ordering is measured against the shared
// server clock, so a fast/slow local clock can't poison the shared ordering:
//   serverNow() === Date.now() + serverOffset   (serverOffset from Firebase's
//   .info/serverTimeOffset)

/** Server-corrected "now". A missing offset is treated as 0. */
export function computeServerNow(now, offset) {
  return now + (offset || 0);
}

/**
 * A persisted high-water mark can never legitimately exceed server-corrected
 * "now". If a fast local clock pushed it into the future it would reject every
 * newer honest update forever — so clamp it back down to serverNow.
 */
export function clampHighWaterMark(stored, serverNowVal) {
  return stored > serverNowVal ? serverNowVal : stored;
}

// ── live-sync accept/reject (GUARD 2/3/4 in startFirebaseSync) ───────────────
//
// GUARD 1 (syncing resetTs from the incoming snapshot) is a side effect handled
// separately; this covers the three guards that decide acceptance.

/**
 * Decide whether an incoming live snapshot should be accepted.
 * @returns {{accept: boolean, reason: string|null}}
 */
export function syncDecision(d, { myDataTs = 0, appVer = 0 } = {}) {
  if (!d) return { accept: false, reason: null };

  // GUARD 2 — reject data from older app versions.
  if (d.ver && d.ver < appVer) {
    return { accept: false, reason: '🚫 Rejecting old version data ver:' + d.ver + ' current:' + appVer };
  }
  // GUARD 3 — reject data older than the newest we already hold.
  if (d.ts && d.ts < myDataTs) {
    return { accept: false, reason: '🚫 Rejecting older data ts:' + d.ts + ' mine:' + myDataTs };
  }
  // GUARD 4 — only accept empty data if it's a deliberate clear.
  const incomingHasData =
    (d.routes && d.routes.length > 0) || (d.vehicles && d.vehicles.length > 0);
  if (!incomingHasData && !d.deliberateClear) {
    return { accept: false, reason: '🚫 Rejecting empty data — not a deliberate clear' };
  }
  return { accept: true, reason: null };
}

// ── push-notification freshness (commit e4f4ea1) ─────────────────────────────

/** Was this notification stamped within the freshness window (default 10s)? */
export function isNotifFresh(nTs, serverNowVal, windowMs = 10000) {
  return nTs > serverNowVal - windowMs;
}

// ── ETA overdue within the current working day ───────────────────────────────

/**
 * Is `eta` ("HH:MM") genuinely past within the CURRENT working day?
 * Guards the late-night case: if Start-New-Day ran after this ETA-of-day on the
 * same calendar date, the ETA belongs to the upcoming working day → not overdue.
 * @param {number} nowMinsVal minutes-since-midnight of "now"
 * @param {number} resetTs    RESET_TS (ms); 0 if never reset
 * @param {Date}   nowDate    current Date (for the same-calendar-day check)
 */
export function etaOverdueToday(eta, nowMinsVal, resetTs, nowDate) {
  if (!eta) return false;
  const etaM = t2m(eta);
  if (nowMinsVal <= etaM) return false;
  if (resetTs) {
    const rd = new Date(resetTs);
    const rm = rd.getHours() * 60 + rd.getMinutes();
    if (nowDate.toDateString() === rd.toDateString() && rm > etaM) return false;
  }
  return true;
}

// ── carry-over flagging (markCarryOvers) ─────────────────────────────────────
//
// Core rule shared by vehicles and routes: an item created before the last
// Start-New-Day boundary (RESET_TS) is a carry-over. createdAt and resetTs must
// be on the same (server) clock — hence the serverNow() stamping in 9935d23.

/** createdAt strictly before the reset boundary. Unknown createdAt / no reset → false. */
export function isOldByResetTs(createdAt, resetTs) {
  return createdAt ? createdAt < resetTs : false;
}

/** Should this vehicle be flagged as a carry-over from a previous working day? */
export function shouldMarkCarryOverVehicle(v, resetTs) {
  if (!v) return false;
  if (v.isCarryOver) return false;       // already flagged
  if (v.status === 'out') return false;  // departed
  if (!v.routeId) return false;          // pool vehicle — never flag
  return isOldByResetTs(v.createdAt, resetTs);
}

/** Should this route be flagged as a carry-over? `linkedVehicle` is its assigned vehicle (or null). */
export function shouldMarkCarryOverRoute(r, resetTs, linkedVehicle) {
  if (!r) return false;
  if (r.isCarryOver) return false;
  if (r.status === 'out') return false;
  if (linkedVehicle && linkedVehicle.status === 'out') return false;
  return isOldByResetTs(r.createdAt, resetTs);
}
