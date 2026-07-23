# Testing

The app ships as a single self-contained `index.html`, so it does **not** import
any modules at runtime. To make the risky, hard-to-eyeball logic testable, the
pure parts are mirrored in `src/logic.js` and exercised with [Vitest](https://vitest.dev/).

## Running

```bash
npm install      # once
npm test         # run all tests
npm run test:watch
npm run coverage
```

## Layout

| File | What it covers |
| --- | --- |
| `src/logic.js` | Canonical, dependency-free copies of the pure logic (time helpers, clock-skew correction, sync guards, carry-over/ETA rules). |
| `test/time.test.js` | `t2m`, `fmtM`, `esc`, `validVNum`. |
| `test/clock-skew.test.js` | `computeServerNow`, `clampHighWaterMark`, `syncDecision` (GUARD 2/3/4), `isNotifFresh` — including a regression that reproduces the original "throwing old data" skew bug. |
| `test/carryover.test.js` | `etaOverdueToday` (late-night reset guard) and carry-over flagging. |
| `test/parity.test.js` | Extracts the one-line utilities from `index.html` and asserts they behave **identically** to `src/logic.js`, so the two copies can't silently drift. |
| `test/regression-source.test.js` | Asserts `index.html` keeps routing every cross-device timestamp through `serverNow()` — locks the three clock-skew fixes. |

## Keeping the two copies in sync

Because `index.html` is deployed as a single file, `src/logic.js` is a mirror,
not the source it loads. If you change one, change the other — the parity and
regression-source tests fail loudly if the pure utilities or the `serverNow()`
wiring diverge.

A future option is to make `src/logic.js` the single source of truth and inline
it into `index.html` at build time; until then, the tests above are the guard.
