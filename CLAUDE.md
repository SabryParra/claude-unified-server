# claude-unified-server (CUS)

> Sync ~/.claude/ config across devices via self-hosted server.
> Phase 1 : OSS · Phase 2 : Cloud SaaS hosted (10€/mo)

---

## CONTEXTE PROJET

**Objectif :** Synchroniser config Claude Code (skills, agents, commands, hooks, memory) entre devices Mac/Linux/Mobile via serveur self-hosted + future SaaS managed.

**Statut :** En développement (Phase 1 MVP)
**Démarré le :** 2026-05-11
**Audience :** Power users Claude Code (community) + futurs clients SaaS
**URL :** github.com/SabryParra/claude-unified-server (à créer)
**License :** MIT
**task_manager:** multica (projet 9e574919-f931-4f73-998e-4e610ddf8fd9)

---

## STACK TECHNIQUE (Phase 1 — OSS MVP)

| Layer | Tech | Note |
|-------|------|------|
| Runtime | **Bun** | rapide, all-in-one |
| Framework HTTP | **Hono** | léger, edge-ready |
| Validation | **zod** | schemas runtime |
| Auth | **JWT** signé HMAC | secret par device |
| Storage Phase 1 | **filesystem** | simple, debuggable |
| Storage Phase 2 | TBD (DB/server à revoir) | options : Turso, Postgres, R2 |
| CLI | **Bun script** | binary claude-sync |
| Mobile UI | **Astro + HTMX** | dashboard read-mostly |
| Hosting | self-hosted Bun (VPS) OU Fly.io | |

> DB et server : décision repoussée. Phase 1 = filesystem JSON storage.
> Évaluer Turso/Neon/Postgres en début Phase 2 selon volume réel.

---

## ARCHITECTURE

```
Devices (Mac, Linux, Mobile)
  └─ ~/.claude/  ──→  claude-sync CLI  ──→  CUS Server
                                              │
                                              ▼
CUS Server (Bun + Hono)
  ├─ REST API : /api/v1/{skills,agents,commands,memory,...}
  ├─ Web UI   : / (Astro dashboard mobile)
  ├─ Storage  : ./data/<user-id>/ (filesystem)
  └─ Auth     : JWT (device-id signé)
```

---

## RÈGLES SPÉCIFIQUES AU PROJET

- **Secrets jamais sync** : settings.json filtré (env block stripé avant push)
- **Encryption recommandée** : push fichiers chiffrés client-side (age/ssh)
- **Schema versioning** : X-Schema-Version header, force pull si bump
- **Rate limit** : 100 req/min/device
- **Audit log** : chaque push/pull tracé dans ./data/<user>/audit.jsonl
- **Tests obligatoires** : auth flow + sync conflicts + filter secrets
- **Bun first** : pas de Node.js npm packages incompatibles Bun
- **Pas de DB en Phase 1** : filesystem only (Sabry choice)

---

## ROADMAP

### Phase 1 — OSS MVP (semaines 1-2)
- [x] Bun + Hono skeleton
- [x] JWT auth flow
- [x] Endpoints sync : skills/agents/commands/memory
- [x] CLI claude-sync (init/pull/push/status/run)
- [x] Hooks intégration (SessionStart/Stop via `claude-sync hooks install`)
- [x] Tests unitaires + e2e auth
- [x] README + getting started
- [ ] Release v0.1.0 GitHub

### Phase 2 — Cloud SaaS (mois 2-3)
- [ ] Multi-tenant
- [ ] DB migration (Turso ou Postgres — décision Phase 2)
- [ ] Stripe billing (10€/mo solo, 30€/mo team)
- [ ] Mobile UI Astro
- [ ] Landing page

### Phase 3 — Croissance (mois 4+)
- [ ] Migration Rust si > 200 paying users
- [ ] Marketplace skills/agents
- [ ] Team workspaces
