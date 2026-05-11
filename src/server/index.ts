/**
 * CUS Server — entry point
 * Bun + Hono, filesystem storage, JWT device auth.
 *
 * Run: bun run dev
 *   or: claude-sync run [--port N] [--host H]
 */

import { createApp } from '~/server/app.ts';
import { ensureDataDir } from '~/lib/storage.ts';

const PORT = Number(process.env.PORT ?? 3017);
const HOST = process.env.HOST ?? '0.0.0.0';

if ((process.env.JWT_SECRET ?? '').startsWith('CHANGE_ME')) {
  console.warn('⚠️  WARNING: JWT_SECRET is not set. Use a strong random secret in production!');
  console.warn('   Run: export JWT_SECRET=$(openssl rand -hex 32)');
}

await ensureDataDir();

const app = createApp();

console.log(`╔══════════════════════════════════════════════╗`);
console.log(`  CUS — Claude Unified Server v0.1.0-alpha    `);
console.log(`  http://${HOST}:${PORT}                      `);
console.log(`╚══════════════════════════════════════════════╝`);

export default {
  port: PORT,
  hostname: HOST,
  fetch: app.fetch,
};
