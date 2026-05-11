/**
 * storage.ts — filesystem storage (Phase 1, no DB)
 *
 * Layout :
 *   ./data/
 *     ├── users.json              (registry user-id ↔ device tokens)
 *     ├── <user-id>/
 *     │   ├── skills/<name>/SKILL.md + assets
 *     │   ├── agents/<name>.md
 *     │   ├── commands/<name>.md
 *     │   ├── memory/<key>.json
 *     │   ├── settings.sanitized.json
 *     │   └── audit.jsonl
 *
 * Phase 2 : migration vers Turso/Postgres + R2 sera dans `lib/storage-v2.ts`.
 */

import { readFile, writeFile, mkdir, readdir, unlink, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

export const DATA_DIR = process.env.CUS_DATA_DIR ?? './data';

export async function ensureDataDir(): Promise<void> {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
    console.log(`[storage] created ${DATA_DIR}`);
  }
}

export function userDir(userId: string): string {
  return join(DATA_DIR, userId);
}

export function resourcePath(
  userId: string,
  kind: 'skills' | 'agents' | 'commands' | 'memory',
  name: string,
): string {
  if (kind === 'skills') return join(userDir(userId), 'skills', name, 'SKILL.md');
  return join(userDir(userId), kind, `${name}.${kind === 'memory' ? 'json' : 'md'}`);
}

export async function writeResource(filePath: string, content: string): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
}

export async function readResource(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

export async function deleteResource(filePath: string): Promise<boolean> {
  try {
    await unlink(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function listResources(
  userId: string,
  kind: 'skills' | 'agents' | 'commands' | 'memory',
): Promise<Array<{ name: string; size: number; mtime: number }>> {
  const dir = join(userDir(userId), kind);
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const out: Array<{ name: string; size: number; mtime: number }> = [];
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const stats = await stat(full);
      out.push({
        name: entry.name.replace(/\.(md|json)$/, ''),
        size: stats.size,
        mtime: stats.mtimeMs,
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function appendAudit(userId: string, event: Record<string, unknown>): Promise<void> {
  const file = join(userDir(userId), 'audit.jsonl');
  await mkdir(userDir(userId), { recursive: true });
  await writeFile(file, JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n', { flag: 'a' });
}
