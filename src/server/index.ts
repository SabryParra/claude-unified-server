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
