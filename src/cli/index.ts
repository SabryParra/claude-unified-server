#!/usr/bin/env bun
/**
 * claude-sync — CLI client for CUS
 *
 * Commands:
 *   claude-sync init --server <url>          Register device, save config
 *   claude-sync pull                          Server → local
 *   claude-sync push                          Local → server (strips secrets)
 *   claude-sync status                        Device info + token expiry
 *   claude-sync run [--port N] [--host H]     Start CUS server locally
 *       [--data <dir>]
 *   claude-sync hooks install                 Add SessionStart/Stop auto-sync hooks
 *   claude-sync hooks uninstall               Remove auto-sync hooks
 */

import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { stripSecrets } from '../lib/secrets.ts';

const HOME = homedir();
const CLAUDE_DIR = join(HOME, '.claude');
const CONFIG_FILE = join(CLAUDE_DIR, 'cus-config.json');
const SETTINGS_FILE = join(CLAUDE_DIR, 'settings.json');

const KINDS = ['skills', 'agents', 'commands', 'memory'] as const;
type Kind = (typeof KINDS)[number];

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
  console.log(`   userId   : ${data.userId}`);
  console.log(`   deviceId : ${data.deviceId}`);
  console.log(`   config   : ${CONFIG_FILE}`);
}

// ── pull ────────────────────────────────────────────────────────

function localPath(kind: Kind, name: string): string {
  if (kind === 'skills') return join(CLAUDE_DIR, 'skills', name, 'SKILL.md');
  if (kind === 'memory') return join(CLAUDE_DIR, 'memory', `${name}.json`);
  return join(CLAUDE_DIR, kind, `${name}.md`);
}

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
  for (const kind of KINDS) {
    for (const item of manifest[kind] ?? []) {
      const r = await api(cfg, `/api/v1/sync/${kind}/${item.name}`);
      if (!r.ok) continue;
      const { content } = (await r.json()) as { content: string };
      const dest = localPath(kind, item.name);
      await mkdir(join(dest, '..'), { recursive: true });
      await writeFile(dest, content);
      pulled++;
    }
  }
  console.log(`✅ Pulled ${pulled} resources from ${cfg.server}`);
}

// ── push ────────────────────────────────────────────────────────

interface PushItem {
  kind: Kind;
  name: string;
  filePath: string;
}

async function collectLocalFiles(): Promise<PushItem[]> {
  const items: PushItem[] = [];

  // skills: ~/.claude/skills/<name>/SKILL.md
  const skillsDir = join(CLAUDE_DIR, 'skills');
  if (existsSync(skillsDir)) {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const skillFile = join(skillsDir, e.name, 'SKILL.md');
      if (existsSync(skillFile)) {
        items.push({ kind: 'skills', name: e.name, filePath: skillFile });
      }
    }
  }

  // agents: ~/.claude/agents/<name>.md
  const agentsDir = join(CLAUDE_DIR, 'agents');
  if (existsSync(agentsDir)) {
    const entries = await readdir(agentsDir);
    for (const f of entries) {
      if (!f.endsWith('.md')) continue;
      items.push({ kind: 'agents', name: basename(f, '.md'), filePath: join(agentsDir, f) });
    }
  }

  // commands: ~/.claude/commands/<name>.md
  const commandsDir = join(CLAUDE_DIR, 'commands');
  if (existsSync(commandsDir)) {
    const entries = await readdir(commandsDir);
    for (const f of entries) {
      if (!f.endsWith('.md')) continue;
      items.push({
        kind: 'commands',
        name: basename(f, '.md'),
        filePath: join(commandsDir, f),
      });
    }
  }

  // memory: ~/.claude/memory/<name>.json
  const memoryDir = join(CLAUDE_DIR, 'memory');
  if (existsSync(memoryDir)) {
    const entries = await readdir(memoryDir);
    for (const f of entries) {
      if (!f.endsWith('.json')) continue;
      items.push({ kind: 'memory', name: basename(f, '.json'), filePath: join(memoryDir, f) });
    }
  }

  return items;
}

async function cmdPush() {
  const cfg = await loadConfig();
  if (!cfg) {
    console.error('Not initialized. Run: claude-sync init --server <url>');
    process.exit(1);
  }

  const items = await collectLocalFiles();
  if (items.length === 0) {
    console.log('Nothing to push — no skills, agents, commands or memory found in ~/.claude/');
    return;
  }

  let pushed = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of items) {
    const raw = await readFile(item.filePath, 'utf-8').catch(() => null);
    if (raw === null) {
      skipped++;
      continue;
    }

    const { content, detected } = stripSecrets(raw);
    if (detected) {
      console.warn(`⚠️  Secrets stripped from ${item.kind}/${item.name}`);
    }

    const r = await api(cfg, `/api/v1/sync/${item.kind}/${item.name}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });

    if (r.ok) {
      pushed++;
    } else {
      const body = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      console.error(
        `  ✗ ${item.kind}/${item.name} — ${r.status} ${body['error'] ?? ''}`,
      );
      failed++;
    }
  }

  console.log(`✅ Push complete — ${pushed} pushed, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

// ── status ──────────────────────────────────────────────────────

async function cmdStatus() {
  const cfg = await loadConfig();
  if (!cfg) {
    console.error('Not initialized. Run: claude-sync init --server <url>');
    process.exit(1);
  }
  const r = await api(cfg, '/api/v1/auth/whoami');
  if (!r.ok) {
    console.error(`status failed: ${r.status}`);
    process.exit(1);
  }
  const claims = (await r.json()) as Record<string, unknown>;
  console.log(`Server   : ${cfg.server}`);
  console.log(`User     : ${cfg.userId}`);
  console.log(`Device   : ${cfg.deviceId}`);
  console.log(`Scope    : ${(claims['scope'] as string[]).join(', ')}`);
  console.log(`Expires  : ${claims['expiresAt']}`);
}

// ── hooks ────────────────────────────────────────────────────────

const CUS_HOOK_MARKER = 'cus-autosync';

interface HookEntry {
  matcher?: string;
  hooks: Array<{ type: string; command: string }>;
  _cus?: string;
}

interface ClaudeSettings {
  hooks?: Record<string, HookEntry[]>;
  [key: string]: unknown;
}

async function cmdHooks(sub: string | undefined) {
  if (sub === 'install') {
    await hooksInstall();
  } else if (sub === 'uninstall') {
    await hooksUninstall();
  } else if (sub === 'show') {
    await hooksShow();
  } else {
    console.log(`Usage: claude-sync hooks <install|uninstall|show>`);
    process.exit(sub ? 1 : 0);
  }
}

async function readSettings(): Promise<ClaudeSettings> {
  try {
    return JSON.parse(await readFile(SETTINGS_FILE, 'utf-8')) as ClaudeSettings;
  } catch {
    return {};
  }
}

async function writeSettings(settings: ClaudeSettings): Promise<void> {
  await mkdir(CLAUDE_DIR, { recursive: true });
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n');
}

async function hooksInstall() {
  const settings = await readSettings();
  settings.hooks ??= {};

  const pullHook: HookEntry = {
    hooks: [{ type: 'command', command: 'claude-sync pull' }],
    _cus: CUS_HOOK_MARKER,
  };

  const pushHook: HookEntry = {
    hooks: [{ type: 'command', command: 'claude-sync push' }],
    _cus: CUS_HOOK_MARKER,
  };

  // Remove any existing CUS hooks before re-adding
  for (const event of ['SessionStart', 'Stop']) {
    settings.hooks[event] = (settings.hooks[event] ?? []).filter(
      (h) => h._cus !== CUS_HOOK_MARKER,
    );
  }

  settings.hooks['SessionStart'].push(pullHook);
  settings.hooks['Stop'].push(pushHook);

  await writeSettings(settings);
  console.log(`✅ Hooks installed in ${SETTINGS_FILE}`);
  console.log(`   SessionStart → claude-sync pull`);
  console.log(`   Stop         → claude-sync push`);
}

async function hooksUninstall() {
  const settings = await readSettings();
  if (!settings.hooks) {
    console.log('No hooks configured.');
    return;
  }

  let removed = 0;
  for (const event of ['SessionStart', 'Stop']) {
    const before = settings.hooks[event]?.length ?? 0;
    settings.hooks[event] = (settings.hooks[event] ?? []).filter(
      (h) => h._cus !== CUS_HOOK_MARKER,
    );
    removed += before - (settings.hooks[event]?.length ?? 0);
  }

  await writeSettings(settings);
  console.log(`✅ Removed ${removed} CUS hook(s) from ${SETTINGS_FILE}`);
}

async function hooksShow() {
  const settings = await readSettings();
  const cus = Object.entries(settings.hooks ?? {}).flatMap(([event, entries]) =>
    entries
      .filter((h) => h._cus === CUS_HOOK_MARKER)
      .map((h) => `  ${event} → ${h.hooks.map((x) => x.command).join(', ')}`),
  );
  if (cus.length === 0) {
    console.log('No CUS hooks installed. Run: claude-sync hooks install');
  } else {
    console.log('CUS hooks:');
    cus.forEach((line) => console.log(line));
  }
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
  case 'hooks':
    await cmdHooks(rest[0]);
    break;
  default:
    console.log(`Usage: claude-sync <command>

  init --server <url>         Register this device on a CUS server
  pull                        Pull all resources from server → local
  push                        Push local → server (secrets stripped)
  status                      Show device info + token expiry
  run [--port N] [--host H]   Start CUS server locally
      [--data <dir>]
  hooks install               Add SessionStart/Stop auto-sync hooks
  hooks uninstall             Remove auto-sync hooks
  hooks show                  Show installed CUS hooks

  config: ${CONFIG_FILE}
`);
    process.exit(cmd ? 1 : 0);
}
