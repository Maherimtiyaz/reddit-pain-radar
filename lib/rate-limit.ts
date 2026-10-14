/**
 * Tiny in-memory fixed-window rate limiter.
 *
 * Best-effort only: state lives in the module scope of a single server
 * instance, so on serverless/multi-instance deployments (Vercel) each
 * instance tracks its own counters. Good enough to blunt accidental
 * double-submits and naive scripted abuse at the edge; swap for a shared
 * store (Redis/Upstash) if strict global limits are required.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** Drop expired entries so the map cannot grow without bound. */
function prune(now: number): void {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

/**
 * Consume one unit for `key`. Returns `ok: false` once `limit` requests have
 * been seen inside `windowMs`, plus how long the caller should wait.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  if (windows.size > 10_000) prune(now);

  const current = windows.get(key);
  if (!current || current.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (current.count >= limit) {
    return {
      ok: false,
      remaining: 0,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    };
  }

  current.count += 1;
  return {
    ok: true,
    remaining: limit - current.count,
    retryAfterSeconds: 0,
  };
}
