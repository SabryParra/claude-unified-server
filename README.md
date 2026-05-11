# Claude Unified Server (CUS)

> Self-hosted server to sync your `~/.claude/` config across devices.
> Skills, agents, commands, memory — everywhere.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why

Claude Code stores config locally in `~/.claude/` per device. Add a new Mac, lose your skills. Edit a hook on laptop, desktop doesn't know. Mobile? Forget it.

CUS is a tiny self-hosted server (Bun + Hono) that keeps your AI agent OS in sync across devices.

## Quick start — server

```bash
git clone https://github.com/SabryParra/claude-unified-server
cd claude-unified-server
bun install

# Set a real secret in production!
export JWT_SECRET=$(openssl rand -hex 32)

bun run start        # listens on :3017
# or: bun run dev    # hot-reload for development
```

## Quick start — client

```bash
# Install the CLI globally
bun install -g claude-unified-server   # exposes claude-sync

# Register this device
claude-sync init --server https://cus.example.com

# Pull all resources from server → local ~/.claude/
claude-sync pull

# Push local ~/.claude/ → server (secrets stripped automatically)
claude-sync push

# Auto-sync: install SessionStart/Stop hooks in ~/.claude/settings.json
claude-sync hooks install

# Check device info
claude-sync status
```

## CLI reference

| Command | Description |
|---------|-------------|
| `init --server <url>` | Register device, save config to `~/.claude/cus-config.json` |
| `pull` | Download server resources → local `~/.claude/` |
| `push` | Upload local `~/.claude/` → server (secrets stripped) |
| `status` | Show token, user, device, expiry |
| `run [--port N] [--host H] [--data <dir>]` | Start CUS server locally (single binary) |
| `hooks install` | Add `SessionStart`/`Stop` auto-sync hooks |
| `hooks uninstall` | Remove CUS hooks |
| `hooks show` | List installed CUS hooks |

## What gets synced

| Resource | Local path | Server |
|----------|-----------|--------|
| Skills | `~/.claude/skills/<name>/SKILL.md` | `GET/PUT /api/v1/sync/skills/<name>` |
| Agents | `~/.claude/agents/<name>.md` | `GET/PUT /api/v1/sync/agents/<name>` |
| Commands | `~/.claude/commands/<name>.md` | `GET/PUT /api/v1/sync/commands/<name>` |
| Memory | `~/.claude/memory/<name>.json` | `GET/PUT /api/v1/sync/memory/<name>` |

## Security

- **Secrets never synced**: common patterns (GitHub PAT, OpenAI keys, AWS, Slack) are stripped client-side before push. The server also rejects known-secret patterns as a second layer.
- **`env` block stripped**: `settings.json` env variables are removed before sync.
- **JWT auth**: each device gets a signed HMAC-HS256 token. Set `JWT_SECRET` env var to a strong random value.
- **Rate limiting**: 100 req/min per device.
- **Audit log**: every push/pull written to `./data/<user-id>/audit.jsonl`.
- **Per-user isolation**: filesystem storage under `./data/<user-id>/`; users cannot access each other's data.

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `PORT` | `3017` | Server port |
| `HOST` | `0.0.0.0` | Bind address |
| `JWT_SECRET` | ⚠️ change me | JWT signing secret |
| `CUS_DATA_DIR` | `./data` | Storage root |

## Architecture

```
Devices (Mac, Linux, Mobile)
  └─ ~/.claude/  ──→  claude-sync CLI  ──→  CUS Server (Bun + Hono)
                                              │
                                              ├─ JWT auth (jose)
                                              ├─ Rate limit (in-memory)
                                              ├─ REST API /api/v1/sync/*
                                              └─ Storage ./data/<user-id>/
```

## Phase 1 — OSS MVP

- [x] Bun + Hono REST API skeleton
- [x] JWT device auth (issue / verify / whoami)
- [x] Sync endpoints: skills / agents / commands / memory
- [x] CLI: `init` / `pull` / `push` / `status` / `run`
- [x] Auto-sync via `SessionStart` / `Stop` hooks
- [x] Secret stripping (client + server)
- [x] Rate limiting (100 req/min)
- [x] Audit log per user
- [x] Unit tests: auth + secrets
- [x] E2E tests: auth flow + sync conflict isolation

## Phase 2 (planned)

- [ ] Multi-tenant + invite codes
- [ ] DB migration (Turso or Postgres)
- [ ] Stripe billing (10€/mo solo, 30€/mo team)
- [ ] Mobile UI (Astro + HTMX)
- [ ] E2E encryption (age/ssh)

## Development

```bash
bun run dev        # hot-reload server
bun test           # unit + e2e tests
bun run typecheck  # TypeScript check
bun run lint       # Biome lint
```

## License

MIT
