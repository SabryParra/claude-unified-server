#!/usr/bin/env bun
/**
 * claude-sync — CLI client pour CUS
 *
 * Commandes :
 *   claude-sync init --server <url>          → init device + sauve config
 *   claude-sync pull                          → télécharge ressources serveur → local
 *   claude-sync push                          → upload local → serveur (avec strip secrets)
 *   claude-sync status                        → diff local vs serveur
 *   claude-sync whoami                        → infos token
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';

const HOME = homedir();
const CLAUDE_DIR = join(HOME, '.claude');
const CONFIG_FILE = join(CLAUDE_DIR, 'cus-config.json');

interface CUSConfig {
  server: string;
  token: string;
  userId: string;
  deviceId: string;
}

async function loadConfig(): Promise<CUSConfig | null> {
  try {
    return JSON.parse(await readFile(CONFIG_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

async function saveConfig(cfg: CUSConfig): Promise<void> {
  await writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  await Bun.write(CONFIG_FILE, JSON.stringify(cfg, null, 2), { mode: 0o600 } as never);
}

async function api(cfg: CUSConfig, path: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(`${cfg.server}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.token}`,
      ...(opts.headers ?? {}),
    },
  });
}

// ── init ────────────────────────────────────────────────────────

async function cmdInit(args: string[]) {
  const serverIdx = args.indexOf('--server');
  if (serverIdx === -1) {
    console.error('Usage: claude-sync init --server <url>');
    process.exit(1);
  }
  const server = args[serverIdx + 1];
  if (!server) {
    console.error('Missing server URL');
    process.exit(1);
  }
  const deviceName = `${process.env.USER ?? 'unknown'}@${require('node:os').hostname()}`;

  const res = await fetch(`${server}/api/v1/auth/device`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deviceName }),
  });

  if (!res.ok) {
    console.error(`init failed: ${res.status} ${await res.text()}`);
    process.exit(1);
  }

  const data = (await res.json()) as { token: string; userId: string; deviceId: string };
  await saveConfig({ server, ...data });
  console.log(`✅ Device registered.`);
  console.log(`   userId : ${data.userId}`);
  console.log(`   device : ${data.deviceId}`);
  console.log(`   config : ${CONFIG_FILE}`);
}

// ── pull ────────────────────────────────────────────────────────

async function cmdPull() {
  const cfg = await loadConfig();
  if (!cfg) {
    console.error('Not initialized. Run: claude-sync init --server <url>');
    process.exit(1);
  }

  const manifestRes = await api(cfg, '/api/v1/sync/manifest');
  if (!manifestRes.ok) {
    console.error(`pull failed: ${manifestRes.status}`);
    process.exit(1);
  }
  const { manifest } = (await manifestRes.json()) as {
    manifest: Record<string, Array<{ name: string }>>;
  };

  let pulled = 0;
  for (const kind of ['skills', 'agents', 'commands', 'memory'] as const) {
    for (const item of manifest[kind] ?? []) {
      const r = await api(cfg, `/api/v1/sync/${kind}/${item.name}`);
      if (!r.ok) continue;
      const { content } = (await r.json()) as { content: string };
      const localPath =
        kind === 'skills'
          ? join(CLAUDE_DIR, 'skills', item.name, 'SKILL.md')
          : kind === 'memory'
            ? join(CLAUDE_DIR, 'projects', '-Users-sabry', 'memory', `${item.name}.json`)
            : join(CLAUDE_DIR, kind, `${item.name}.md`);
      await mkdir(join(localPath, '..'), { recursive: true });
      await writeFile(localPath, content);
      pulled++;
    }
  }
  console.log(`✅ Pulled ${pulled} resources from ${cfg.server}`);
}

// ── push (placeholder pour Phase 1 MVP) ─────────────────────────

async function cmdPush() {
  const cfg = await loadConfig();
  if (!cfg) {
    console.error('Not initialized.');
    process.exit(1);
  }
  console.log('⚠️  push : TODO Phase 1 (scan local files + filter secrets + PUT chacun)');
}

// ── status ──────────────────────────────────────────────────────

async function cmdStatus() {
  const cfg = await loadConfig();
  if (!cfg) {
    console.error('Not initialized.');
    process.exit(1);
  }
  const r = await api(cfg, '/api/v1/auth/whoami');
  if (!r.ok) {
    console.error(`status failed: ${r.status}`);
    process.exit(1);
  }
  const claims = (await r.json()) as Record<string, unknown>;
  console.log(`Server  : ${cfg.server}`);
  console.log(`User    : ${cfg.userId}`);
  console.log(`Device  : ${cfg.deviceId}`);
  console.log(`Scope   : ${(claims.scope as string[]).join(', ')}`);
  console.log(`Expires : ${claims.expiresAt}`);
}

// ── run (server) ────────────────────────────────────────────────

async function cmdRun(args: string[]) {
  const portIdx = args.indexOf('--port');
  const hostIdx = args.indexOf('--host');
  const dataIdx = args.indexOf('--data');

  const port = portIdx !== -1 ? args[portIdx + 1] : undefined;
  const host = hostIdx !== -1 ? args[hostIdx + 1] : undefined;
  const data = dataIdx !== -1 ? args[dataIdx + 1] : undefined;

  if (port) {
    const n = Number(port);
    if (Number.isNaN(n) || n < 1 || n > 65535) {
      console.error(`Invalid port: ${port}`);
      process.exit(1);
    }
    process.env.PORT = port;
  }
  if (host) process.env.HOST = host;
  if (data) process.env.CUS_DATA_DIR = data;

  const { createApp } = await import('../server/app.ts');
  const { ensureDataDir } = await import('../lib/storage.ts');

  await ensureDataDir();

  const app = createApp();
  const resolvedPort = Number(process.env.PORT ?? 3017);
  const resolvedHost = process.env.HOST ?? '0.0.0.0';

  console.log(`╔══════════════════════════════════════════════╗`);
  console.log(`  CUS — Claude Unified Server v0.1.0-alpha    `);
  console.log(`  http://${resolvedHost}:${resolvedPort}      `);
  console.log(`╚══════════════════════════════════════════════╝`);

  Bun.serve({
    port: resolvedPort,
    hostname: resolvedHost,
    fetch: app.fetch,
  });

  // Keep the process alive
  await new Promise<never>(() => {});
}

// ── main ────────────────────────────────────────────────────────

const [, , cmd, ...rest] = process.argv;

switch (cmd) {
  case 'init':
    await cmdInit(rest);
    break;
  case 'pull':
    await cmdPull();
    break;
  case 'push':
    await cmdPush();
    break;
  case 'status':
  case 'whoami':
    await cmdStatus();
    break;
  case 'run':
    await cmdRun(rest);
    break;
  default:
    console.log(`Usage: claude-sync <command>

  init --server <url>         Initialize device on CUS server
  pull                        Pull all resources from server → local
  push                        Push local → server (filters secrets) [TODO]
  status                      Show device info + token expiry
  run [--port N] [--host H]   Start the CUS server locally
      [--data <dir>]

  config: ${CONFIG_FILE}
`);
    process.exit(cmd ? 1 : 0);
}
