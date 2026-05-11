import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import {
  resourcePath,
  readResource,
  writeResource,
  deleteResource,
  listResources,
  appendAudit,
} from '~/lib/storage.ts';
import { requireScope } from '~/middleware/auth.ts';

export const syncRoutes = new Hono<{
  Variables: { userId: string; deviceId: string; scope: string[] };
}>();

const KINDS = ['skills', 'agents', 'commands', 'memory'] as const;
type Kind = (typeof KINDS)[number];

const nameSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9-_:.]+$/i, 'Invalid resource name');

// ── Manifest : checksum-like overview ───────────────────────────

syncRoutes.get('/manifest', async (c) => {
  const userId = c.get('userId');
  const manifest: Record<string, ReturnType<typeof listResources>> = {} as never;
  for (const kind of KINDS) {
    // @ts-expect-error — assigning promise then awaiting below
    manifest[kind] = listResources(userId, kind);
  }
  const resolved: Record<string, unknown> = {};
  for (const kind of KINDS) {
    resolved[kind] = await listResources(userId, kind);
  }
  return c.json({ userId, manifest: resolved, timestamp: new Date().toISOString() });
});

// ── GET resource ────────────────────────────────────────────────

syncRoutes.get('/:kind/:name', async (c) => {
  const userId = c.get('userId');
  const kind = c.req.param('kind') as Kind;
  const name = c.req.param('name');

  if (!KINDS.includes(kind)) return c.json({ error: 'unknown_kind', kind }, 400);
  const safe = nameSchema.safeParse(name);
  if (!safe.success) return c.json({ error: 'invalid_name', issues: safe.error.issues }, 400);

  const filePath = resourcePath(userId, kind, name);
  const content = await readResource(filePath);
  if (content === null) return c.json({ error: 'not_found', kind, name }, 404);
  return c.json({ kind, name, content, size: content.length });
});

// ── PUT resource ────────────────────────────────────────────────

const putSchema = z.object({
  content: z.string().min(1).max(1_000_000),
  schemaVersion: z.string().optional(),
});

syncRoutes.put('/:kind/:name', requireScope('write'), zValidator('json', putSchema), async (c) => {
  const userId = c.get('userId');
  const deviceId = c.get('deviceId');
  const kind = c.req.param('kind') as Kind;
  const name = c.req.param('name');
  const { content } = c.req.valid('json');

  if (!KINDS.includes(kind)) return c.json({ error: 'unknown_kind', kind }, 400);
  const safe = nameSchema.safeParse(name);
  if (!safe.success) return c.json({ error: 'invalid_name', issues: safe.error.issues }, 400);

  // SECURITY : refuse content with obvious tokens/secrets
  const looksLikeSecret = /(ghp_|gho_|github_pat_|sk-[a-zA-Z0-9]{20,}|xoxb-[a-zA-Z0-9-]{20,})/.test(
    content,
  );
  if (looksLikeSecret) {
    await appendAudit(userId, { event: 'secret_rejected', kind, name, deviceId });
    return c.json({ error: 'secret_detected', hint: 'Strip tokens before sync' }, 400);
  }

  const filePath = resourcePath(userId, kind, name);
  await writeResource(filePath, content);
  await appendAudit(userId, { event: 'resource_put', kind, name, size: content.length, deviceId });

  return c.json({ ok: true, kind, name, size: content.length });
});

// ── DELETE resource ─────────────────────────────────────────────

syncRoutes.delete('/:kind/:name', requireScope('write'), async (c) => {
  const userId = c.get('userId');
  const deviceId = c.get('deviceId');
  const kind = c.req.param('kind') as Kind;
  const name = c.req.param('name');

  if (!KINDS.includes(kind)) return c.json({ error: 'unknown_kind', kind }, 400);

  const filePath = resourcePath(userId, kind, name);
  const ok = await deleteResource(filePath);
  await appendAudit(userId, { event: 'resource_delete', kind, name, found: ok, deviceId });

  return c.json({ ok, kind, name });
});

// ── LIST resources by kind ──────────────────────────────────────

syncRoutes.get('/:kind', async (c) => {
  const userId = c.get('userId');
  const kind = c.req.param('kind') as Kind;
  if (!KINDS.includes(kind)) return c.json({ error: 'unknown_kind', kind }, 400);
  const items = await listResources(userId, kind);
  return c.json({ kind, count: items.length, items });
});
