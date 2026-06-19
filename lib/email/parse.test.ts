import { describe, it, expect } from 'vitest';
import { parseEmails } from './parse';

describe('parseEmails', () => {
  it('returns empty result for empty input', () => {
    const r = parseEmails('');
    expect(r.added).toEqual([]);
    expect(r.duplicates).toBe(0);
    expect(r.invalid).toBe(0);
    expect(r.invalidEmails).toEqual([]);
  });

  it('returns empty result for whitespace-only input', () => {
    const r = parseEmails('   \n\t   ');
    expect(r.added).toEqual([]);
  });

  it('splits on commas', () => {
    const r = parseEmails('a@b.com,c@d.com');
    expect(r.added).toEqual(['a@b.com', 'c@d.com']);
  });

  it('splits on semicolons', () => {
    const r = parseEmails('a@b.com;c@d.com');
    expect(r.added).toEqual(['a@b.com', 'c@d.com']);
  });

  it('splits on newlines', () => {
    const r = parseEmails('a@b.com\nc@d.com\nd@e.com');
    expect(r.added).toEqual(['a@b.com', 'c@d.com', 'd@e.com']);
  });

  it('splits on whitespace', () => {
    const r = parseEmails('a@b.com  c@d.com\td@e.com');
    expect(r.added).toEqual(['a@b.com', 'c@d.com', 'd@e.com']);
  });

  it('handles mixed delimiters', () => {
    const r = parseEmails('a@b.com, c@d.com;\n  d@e.com\tf@g.com');
    expect(r.added).toEqual(['a@b.com', 'c@d.com', 'd@e.com', 'f@g.com']);
  });

  it('trims extra spaces and lowercases', () => {
    const r = parseEmails('  Alice@Example.COM  ');
    expect(r.added).toEqual(['alice@example.com']);
  });

  it('rejects invalid emails and records them', () => {
    const r = parseEmails('a@b.com, not-an-email, foo@bar, c@d.com');
    expect(r.added).toEqual(['a@b.com', 'c@d.com']);
    expect(r.invalid).toBe(2);
    expect(r.invalidEmails).toEqual(['not-an-email', 'foo@bar']);
  });

  it('dedupes within the batch (case-insensitive)', () => {
    const r = parseEmails('a@b.com, A@B.com, a@b.com');
    expect(r.added).toEqual(['a@b.com']);
    expect(r.duplicates).toBe(2);
  });

  it('dedupes against existing set (case-insensitive)', () => {
    const existing = new Set(['a@b.com']);
    const r = parseEmails('A@B.COM, c@d.com', existing);
    expect(r.added).toEqual(['c@d.com']);
    expect(r.duplicates).toBe(1);
  });

  it('counts invalid alongside duplicates and added', () => {
    const r = parseEmails('a@b.com, a@b.com, bad, c@d.com', new Set(['x@y.com']));
    expect(r.added).toEqual(['a@b.com', 'c@d.com']);
    expect(r.duplicates).toBe(1);
    expect(r.invalid).toBe(1);
    expect(r.invalidEmails).toEqual(['bad']);
  });

  it('returns a fresh object each call (no state leak)', () => {
    const r1 = parseEmails('a@b.com');
    const r2 = parseEmails('c@d.com');
    expect(r1.added).toEqual(['a@b.com']);
    expect(r2.added).toEqual(['c@d.com']);
  });
});
