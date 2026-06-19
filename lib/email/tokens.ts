import { createHmac, timingSafeEqual } from 'node:crypto';

// Format: base64url(payload).base64url(hmac_sha256(base64url(payload)))
// Payload is a tiny JSON object so we keep tokens short. No expiry — unsubscribe
// links must keep working indefinitely.

export interface UnsubscribePayload {
  /** contact id */
  c: string;
  /** campaign id (lets us attribute which send triggered the unsubscribe) */
  m: string;
}

function getSecret(): string {
  const secret = process.env.UNSUBSCRIBE_TOKEN_SECRET;
  if (!secret) {
    throw new Error('UNSUBSCRIBE_TOKEN_SECRET is not set');
  }
  return secret;
}

function base64urlEncode(input: string | Buffer): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf-8') : input;
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64urlDecode(input: string): Buffer {
  const padded = input + '='.repeat((4 - (input.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function sign(data: string, secret: string): string {
  return base64urlEncode(createHmac('sha256', secret).update(data).digest());
}

export function signUnsubscribeToken(payload: UnsubscribePayload): string {
  const encoded = base64urlEncode(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, getSecret())}`;
}

export function verifyUnsubscribeToken(
  token: string,
): UnsubscribePayload | null {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const idx = token.indexOf('.');
  const encoded = token.slice(0, idx);
  const signature = token.slice(idx + 1);
  if (!encoded || !signature) return null;

  const expected = sign(encoded, getSecret());

  // Constant-time compare. timingSafeEqual requires equal lengths.
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  try {
    const json = base64urlDecode(encoded).toString('utf-8');
    const parsed = JSON.parse(json);
    if (
      typeof parsed?.c !== 'string' ||
      typeof parsed?.m !== 'string' ||
      !parsed.c ||
      !parsed.m
    ) {
      return null;
    }
    return { c: parsed.c, m: parsed.m };
  } catch {
    return null;
  }
}
