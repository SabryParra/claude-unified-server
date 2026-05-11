# Claude Unified Server (CUS)

> Self-hosted server to sync your `~/.claude/` config across devices.
> Skills, agents, commands, memory — everywhere.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Why

Claude Code stores config locally in `~/.claude/` per device. Add a new Mac, lose your skills. Edit a hook on laptop, desktop doesn't know. Mobile? Forget it.

CUS is a tiny server you self-host that keeps your AI agent OS in sync.

## Quick start (self-hosted)

```bash
# Server side
git clone https://github.com/SabryParra/claude-unified-server
cd claude-unified-server
bun install
bun run start  # listens on :3017

# Client side
claude-sync init --server https://cus.example.com
claude-sync pull
```

## Architecture

```
Device ──→  claude-sync CLI  ──→  CUS Server  ──→  filesystem
~/.claude/                        JWT auth          per-user storage
```

## Phase 1 (OSS) features

- [x] Project skeleton
- [ ] Bun + Hono REST API
- [ ] JWT device auth
- [ ] Sync skills / agents / commands / memory
- [ ] CLI : init / pull / push / status / watch
- [ ] Auto-sync via SessionStart/Stop hooks
- [ ] E2E encryption (optional)


## License

MIT
