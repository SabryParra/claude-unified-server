/**
 * rate-limit.ts — in-memory rate limit (Phase 1)
 * Phase 2 : Redis ou Cloudflare Durable Objects
 */

import type { Context, Next } from 'hono';

const LIMIT = 100; // req
const WINDOW_MS = 60_000; // 1 minute

const counters = new Map<string, { count: number; reset: number }>();

export async function rateLimitMiddleware(c: Context, next: Next) {
  const key =
    c.req.header('authorization')?.slice(-16) ??
    c.req.header('x-forwarded-for') ??
    c.req.header('cf-connecting-ip') ??
    'anonymous';

  const now = Date.now();
  const slot = counters.get(key);

  if (!slot || slot.reset < now) {
    counters.set(key, { count: 1, reset: now + WINDOW_MS });
  } else {
    slot.count++;
    if (slot.count > LIMIT) {
      c.header('Retry-After', String(Math.ceil((slot.reset - now) / 1000)));
      return c.json({ error: 'rate_limited', limit: LIMIT, window: '1min' }, 429);
    }
  }

  await next();
}

// Cleanup occasionnel pour éviter memory leak
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of counters) {
    if (v.reset < now) counters.delete(k);
  }
}, 60_000).unref();
