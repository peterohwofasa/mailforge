// Sliding-window rate limit. In-memory only — adequate for single-instance
// dev and for the small Vercel scale we expect in v1 (one user, light
// traffic). Cold starts reset the window; that's fine since cold starts
// don't happen at human-burst frequency. Move to a Postgres-backed limiter
// (or Upstash) if/when multi-tenant goes live.

const windows = new Map<string, number[]>();

interface RateLimitResult {
  ok: boolean;
  /** Seconds until the next request would be allowed, only set when ok=false. */
  retryAfter?: number;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;
  const recent = (windows.get(key) ?? []).filter((t) => t > cutoff);

  if (recent.length >= limit) {
    const oldest = recent[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    windows.set(key, recent);
    return { ok: false, retryAfter };
  }

  recent.push(now);
  windows.set(key, recent);
  return { ok: true };
}
