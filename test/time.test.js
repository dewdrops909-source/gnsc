import { describe, it, expect } from 'vitest';
import { t2m, fmtM, esc, validVNum } from '../src/logic.js';

describe('t2m', () => {
  it('converts HH:MM to minutes', () => {
    expect(t2m('00:00')).toBe(0);
    expect(t2m('01:30')).toBe(90);
    expect(t2m('23:59')).toBe(1439);
  });
  it('treats empty/undefined as 0', () => {
    expect(t2m('')).toBe(0);
    expect(t2m(undefined)).toBe(0);
    expect(t2m(null)).toBe(0);
  });
  it('ignores anything past HH:MM', () => {
    expect(t2m('10:15:30')).toBe(615);
  });
});

describe('fmtM', () => {
  it('formats minutes under an hour', () => {
    expect(fmtM(45)).toBe('45m');
    expect(fmtM(59)).toBe('59m');
  });
  it('formats hours and minutes', () => {
    expect(fmtM(60)).toBe('1h 0m');
    expect(fmtM(90)).toBe('1h 30m');
    expect(fmtM(125)).toBe('2h 5m');
  });
  it('returns 0m for non-positive/empty', () => {
    expect(fmtM(0)).toBe('0m');
    expect(fmtM(-5)).toBe('0m');
    expect(fmtM(undefined)).toBe('0m');
  });
});

describe('esc', () => {
  it('escapes HTML metacharacters', () => {
    expect(esc('<script>')).toBe('&lt;script&gt;');
    expect(esc('a & b')).toBe('a &amp; b');
    expect(esc('say "hi"')).toBe('say &quot;hi&quot;');
  });
  it('escapes ampersands before entities (no double-escape ordering bug)', () => {
    expect(esc('<')).toBe('&lt;');
    expect(esc('&lt;')).toBe('&amp;lt;');
  });
  it('coerces nullish to empty string', () => {
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc('')).toBe('');
  });
});

describe('validVNum', () => {
  it('accepts well-formed plates', () => {
    expect(validVNum('MH12AB1234')).toBe(true);
    expect(validVNum('mh12ab1234')).toBe(true); // case-insensitive
    expect(validVNum('MH 12 AB 1234')).toBe(true); // spaces stripped
    expect(validVNum('KA5M9999')).toBe(true);
  });
  it('rejects malformed plates', () => {
    expect(validVNum('')).toBe(false);
    expect(validVNum(undefined)).toBe(false);
    expect(validVNum('1234')).toBe(false);
    expect(validVNum('MHAB1234')).toBe(false);  // missing district digits
    expect(validVNum('MH12AB123')).toBe(false); // only 3 trailing digits
    expect(validVNum('MH12ABCD')).toBe(false);  // no trailing digit block
  });
});
