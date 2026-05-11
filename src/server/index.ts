/**
 * CUS Server — entry point
 * Bun + Hono, filesystem storage, JWT device auth.
 *
 * Run: bun run dev
 */

import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { authRoutes } from '~/routes/auth.ts';
import { syncRoutes } from '~/routes/sync.ts';
import { healthRoutes } from '~/routes/health.ts';
import { rateLimitMiddleware } from '~/middleware/rate-limit.ts';
import { authMiddleware } from '~/middleware/auth.ts';
import { ensureDataDir } from '~/lib/storage.ts';

const PORT = Number(process.env.PORT ?? 3017);
const HOST = process.env.HOST ?? '0.0.0.0';

await ensureDataDir();

const app = new Hono();

// ── Global middleware ──────────────────────────────────────────
app.use('*', logger());
app.use('*', secureHeaders());
app.use('*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'] }));

// ── Public routes ──────────────────────────────────────────────
app.route('/health', healthRoutes);
app.route('/api/v1/auth', authRoutes);

// ── Protected routes (JWT required) ────────────────────────────
app.use('/api/v1/sync/*', rateLimitMiddleware);
app.use('/api/v1/sync/*', authMiddleware);
app.route('/api/v1/sync', syncRoutes);

// ── Root ───────────────────────────────────────────────────────
app.get('/', (c) =>
  c.json({
    name: 'claude-unified-server',
    version: '0.1.0-alpha.0',
    docs: '/api/v1/docs',
    health: '/health',
  }),
);

// ── 404 fallback ───────────────────────────────────────────────
app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));

app.onError((err, c) => {
  console.error('[CUS error]', err);
  return c.json({ error: 'internal_error', message: err.message }, 500);
});

console.log(`╔══════════════════════════════════════════════╗`);
console.log(`  CUS — Claude Unified Server v0.1.0-alpha    `);
console.log(`  http://${HOST}:${PORT}                      `);
console.log(`╚══════════════════════════════════════════════╝`);

export default {
  port: PORT,
  hostname: HOST,
  fetch: app.fetch,
};
