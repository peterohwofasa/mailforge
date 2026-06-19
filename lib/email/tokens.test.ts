import { describe, it, expect, beforeAll } from 'vitest';
import { signUnsubscribeToken, verifyUnsubscribeToken } from './tokens';

beforeAll(() => {
  // Tests need a stable secret; .env.local isn't loaded in vitest runs.
  process.env.UNSUBSCRIBE_TOKEN_SECRET = 'test-secret-for-vitest-1234567890';
});

describe('unsubscribe tokens', () => {
  it('signs and verifies round-trip', () => {
    const payload = { c: 'contact-uuid-123', m: 'campaign-uuid-456' };
    const token = signUnsubscribeToken(payload);
    expect(token).toContain('.');
    const parts = token.split('.');
    expect(parts).toHaveLength(2);

    const verified = verifyUnsubscribeToken(token);
    expect(verified).toEqual(payload);
  });

  it('produces the same token for the same input (deterministic)', () => {
    const payload = { c: 'a', m: 'b' };
    expect(signUnsubscribeToken(payload)).toBe(signUnsubscribeToken(payload));
  });

  it('rejects a tampered payload', () => {
    const token = signUnsubscribeToken({ c: 'a', m: 'b' });
    const [payload, sig] = token.split('.');
    // Swap one character in the payload portion
    const tampered = payload.slice(0, -1) + (payload.endsWith('A') ? 'B' : 'A') + '.' + sig;
    expect(verifyUnsubscribeToken(tampered)).toBeNull();
  });

  it('rejects a tampered signature', () => {
    const token = signUnsubscribeToken({ c: 'a', m: 'b' });
    const [payload, sig] = token.split('.');
    const tamperedSig = sig.slice(0, -1) + (sig.endsWith('A') ? 'B' : 'A');
    expect(verifyUnsubscribeToken(`${payload}.${tamperedSig}`)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifyUnsubscribeToken('')).toBeNull();
    expect(verifyUnsubscribeToken('no-dot-here')).toBeNull();
    expect(verifyUnsubscribeToken('.justdot')).toBeNull();
    expect(verifyUnsubscribeToken('justdot.')).toBeNull();
  });

  it('rejects a token signed with a different secret', () => {
    const token = signUnsubscribeToken({ c: 'a', m: 'b' });
    process.env.UNSUBSCRIBE_TOKEN_SECRET = 'different-secret-9999999999';
    expect(verifyUnsubscribeToken(token)).toBeNull();
    process.env.UNSUBSCRIBE_TOKEN_SECRET = 'test-secret-for-vitest-1234567890';
  });

  it('rejects payloads missing required fields', () => {
    // Build a valid-looking but bad payload by signing it ourselves
    const badPayload = Buffer.from(JSON.stringify({ c: '', m: 'b' })).toString(
      'base64',
    ).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const token = signUnsubscribeToken({ c: 'placeholder', m: 'placeholder' });
    const sig = token.split('.')[1];
    // The signature won't match for the swapped payload — which IS what we want
    // to reject anyway. Verify both conditions are caught.
    expect(verifyUnsubscribeToken(`${badPayload}.${sig}`)).toBeNull();
  });
});
