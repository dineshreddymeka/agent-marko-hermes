# Backend ↔ Frontend API Mapping

How **Agent-Marko UI** talks to **Hermes FastAPI**, and how to port route
changes from another Hermes backend into this repo.

**Last validated:** `npm run validate:api-map` — 79 UI paths, 83 inventory
entries, 0 missing. Live OpenAPI ~247 paths on Hermes `:9119`.

## One-hop architecture

```
Browser (Marko UI)
   │  same-origin paths only
   │  REST  /api/*
   │  SSE   POST /agui
   ▼
Preferred: Hermes :9119 serves static export + APIs (no proxy)
Optional HMR: Next :5173 ──rewrites──► Hermes :9119
```

- There is **no Bun/middle orchestration layer** and **no Cloudflare tunnel**
  required for normal preview.
- Preferred preview: `bash scripts/start-hermes-ui.sh` → **http://127.0.0.1:9119/**
- UI never hard-codes the Hermes host in browser code (same-origin `/api/*`).
- Flexibility comes from Hermes **Swagger/OpenAPI** (`/docs`, `/openapi.json`)
  and Marko **`GET /api/capabilities`** (feature flags derived from live paths).

### Optional Next HMR rewrites

Only when iterating on UI with hot reload (`npm run dev:ui`):

| Browser path | Rewritten to |
|--------------|--------------|
| `/api/:path*` | `HERMES_URL/api/:path*` (default `http://127.0.0.1:9119`) |
| `/agui` | `HERMES_URL/agui` |

Configured in `ui/next.config.ts`. Ignored for `output: 'export'` builds
(Hermes mounts the SPA).

### Auth bootstrap

| Step | Path / header | Notes |
|------|---------------|-------|
| Preferred (Hermes SPA) | `window.__HERMES_SESSION_TOKEN__` | Injected into Hermes-served `index.html` |
| Optional HMR / loopback | `GET /api/marko/boot` | Loopback-only; returns session token |
| All API calls | Header `X-Hermes-Session-Token` | Via `hermesAuthHeaders()` in `ui/src/lib/api.ts` |
| Public (no token) | `/api/health`, `/api/status`, `/api/marko/boot`, … | See `hermes/hermes_cli/dashboard_auth/public_paths.py` |

---

## How to integrate another Hermes backend

When another system ships backend API changes, follow this checklist:

1. **Diff OpenAPI**
   - Their: `GET {backend}/openapi.json`
   - Ours: `GET http://127.0.0.1:9119/openapi.json` (or `/docs`)
2. **Classify each new/changed path**
   - Already called by Marko → update adapters/panels only if contract changed
   - New Marko surface → add UI client + panel + shared types
   - Hermes-only (ops/plugins) → no UI work required
3. **Port the FastAPI handler** into `hermes/hermes_cli/` (or Marko shim module)
4. **Add aliases if Marko path ≠ Hermes path** (see [Aliases](#path-aliases))
5. **Extend `_FEATURE_PATH_PREFIXES`** in `hermes/hermes_cli/marko_capabilities.py`
   so `/api/capabilities` exposes the new feature flag
6. **Gate the rail/panel** with `isHermesFeatureEnabled(capabilities, 'featureKey')`
7. **Update this file** + shared types in `packages/shared/src/api-types.ts`
8. **Smoke**
   - `GET /api/capabilities` → `features.<key> === true`
   - Panel fetch returns 200 with session token
   - For chat: `POST /agui` SSE events still parse

### Contract sources of truth

| Layer | Location |
|-------|----------|
| Live OpenAPI | Hermes `/openapi.json` |
| Feature discovery | `GET /api/capabilities` → `features` |
| Shared TS DTOs | `packages/shared/src/api-types.ts` |
| UI HTTP client | `ui/src/lib/api.ts` (`apiClient`) |
| AG-UI stream | `ui/src/lib/agui/client.ts` + `dispatcher.ts` |
| Adapters | `ui/src/lib/hermes-adapters.ts`, `*-api.ts`, `hermes-skills.ts`, `settings-hermes.ts` |

---

## Feature flags ↔ panels

`GET /api/capabilities` builds `features` from OpenAPI path prefixes
(`hermes_cli/marko_capabilities.py`). IconRail soft-gates on these keys:

| Feature key | OpenAPI prefix(es) | UI surface |
|-------------|--------------------|------------|
| `agui` | `/agui` | Chat agent stream |
| `a2ui` | follows `agui` | Interactive A2UI surfaces |
| `sessions` | `/api/sessions` | Sidebar / sessions |
| `profiles` | `/api/profiles` | Profiles panel |
| `skills` | `/api/skills` | Skills rail |
| `memory` | `/api/memory` | Memory rail |
| `mcp` | `/api/mcp` | Connections rail |
| `cron` | `/api/cron` | Cowork/Cron rail |
| `kanban` | `/api/kanban` | Kanban rail |
| `workspace` | `/api/fs`, `/api/workspace` | Workspace rail |
| `search` | `/api/search` | Session/memory search |
| `approval` | `/api/approval` | Tool approval (not mounted yet) |
| `cowork` | `/api/cowork` | Open Cowork (not mounted yet) |
| `office` | `/api/office` | Office/Briefing (not mounted yet) |
| `debug` | `/api/debug` | Debug replay (not mounted yet) |

When `features` is missing/null, UI treats flags as **enabled** (fail-open for older backends).

---

## Path aliases

Marko sometimes uses shorter paths; Hermes maps them:

| Frontend path | Hermes resolves to | Why |
|---------------|--------------------|-----|
| `POST /api/cron` | `POST /api/cron/jobs` | A2UI create_cron |
| `PUT /api/workspace/file` | `POST /api/fs/write-text` | A2UI create_document |
| `GET /api/mcp` | `GET /api/mcp/servers` | Legacy cron wizard |
| `POST /api/mcp/{id}/test` | `POST /api/mcp/servers/{id}/test` | Legacy cron wizard |
| `GET /api/profiles?marko=1` | Marko DTO bridge on `/api/profiles` | Profile shape |

---

## AG-UI (chat) — primary integration

| Direction | Method | Path | Frontend | Backend |
|-----------|--------|------|----------|---------|
| Agent run | `POST` | `/agui` | `ui/src/lib/agui/client.ts` `runAgent` | `hermes_cli/agui_endpoint.py` |
| A2UI follow-up | `POST` | `/agui` | `ui/src/lib/a2ui/actions.ts` | same |

### SSE events Marko consumes

| Event | UI effect |
|-------|-----------|
| `RUN_STARTED` / `RUN_FINISHED` / `RUN_ERROR` | Run status strip |
| `STEP_STARTED` / `STEP_FINISHED` | Step chips |
| `TEXT_MESSAGE_*` | Assistant streaming |
| `THINKING_TEXT_MESSAGE_*` | Thinking block |
| `TOOL_CALL_*` / `TOOL_CALL_RESULT` | Tool cards |
| `STATE_SNAPSHOT` / `STATE_DELTA` | Agent state panel |
| `MESSAGES_SNAPSHOT` | Replace transcript |
| `CUSTOM hermes.context` | Context token ring |
| `CUSTOM hermes.title` | Session title |
| `CUSTOM hermes.skill.learned` | Toast |
| `CUSTOM hermes.cron.fired` | Toast |
| `CUSTOM a2ui.message` | A2UI surface |
| `CUSTOM hermes.approval.required` | Approval card |
| `CUSTOM hermes.cowork.progress` | Cowork progress lines |

Defined but not yet dispatched in UI: `hermes.tool.error`, `hermes.capabilities.degraded`, `hermes.delegation`.

---

## Full Marko ↔ Hermes REST map

Status legend:

- **wired** — Hermes route exists and UI calls it
- **alias** — Marko path aliased to Hermes handler
- **missing** — UI calls it; Hermes has no route yet (port from other backend)
- **unused** — typed/shared but no live UI caller

### Boot / health / discovery

| Method | Path | Status | Frontend caller | Backend |
|--------|------|--------|-----------------|---------|
| GET | `/api/marko/boot` | wired | `hermes-boot.ts` | `web_server.marko_boot` |
| GET | `/api/health` | wired | `AppShell`, `StatusFooter`, `login` | `web_server.marko_health` |
| GET | `/api/capabilities` | wired | `useCapabilities.ts` | `marko_capabilities.py` |
| POST | `/api/capabilities` | wired | (same as warm) | same |
| POST | `/api/capabilities/warm` | wired | `ConnectionsPanel` | same |
| GET | `/openapi.json` | wired | Swagger / integration diffs | FastAPI |
| GET | `/docs` | wired | Human docs | FastAPI |

### Sessions

| Method | Path | Status | Frontend | Backend |
|--------|------|--------|----------|---------|
| GET | `/api/sessions` | wired | `hermes-adapters.fetchHermesSessions` | web_server |
| POST | `/api/sessions` | wired | adapters + Composer/Sidebar | web_server |
| GET | `/api/sessions/search` | unused | exported adapter only | web_server |
| PATCH | `/api/sessions/{id}` | wired | SessionsPanel | web_server |
| DELETE | `/api/sessions/{id}` | wired | SessionsPanel | web_server |
| GET | `/api/sessions/{id}/messages` | wired | `loadSessionMessages` | web_server |
| GET | `/api/sessions/{id}/live` | wired | live poll | always `{live:false}` on Hermes |

### Profiles / settings defaults

| Method | Path | Status | Frontend | Backend |
|--------|------|--------|----------|---------|
| GET | `/api/profiles?marko=1` | wired | adapters / panels | Marko bridge |
| POST | `/api/profiles` | wired | ProfilesPanel | Marko body branch |
| PATCH | `/api/profiles/{id}` | wired | ProfilesPanel | web_server |
| POST | `/api/profiles/{id}/default` | wired | ProfilesPanel | web_server |
| DELETE | `/api/profiles/{id}` | wired | ProfilesPanel | web_server |
| GET | `/api/settings` | wired | default profile id | web_server |

### MCP

| Method | Path | Status | Frontend | Backend |
|--------|------|--------|----------|---------|
| GET | `/api/mcp/servers` | wired | McpSubPanel | web_server |
| POST | `/api/mcp/servers` | wired | McpSubPanel | web_server |
| PUT | `/api/mcp/servers` | wired | bulk tool allowlists | web_server |
| DELETE | `/api/mcp/servers/{id}` | wired | McpSubPanel | web_server |
| PUT | `/api/mcp/servers/{id}/enabled` | wired | McpSubPanel | web_server |
| POST | `/api/mcp/servers/{id}/test` | wired | McpSubPanel | web_server |
| GET | `/api/mcp/servers/{id}/events` | wired | McpSubPanel | web_server |
| GET | `/api/mcp` | alias | CronPanel | → servers |
| POST | `/api/mcp/{id}/test` | alias | CronPanel | → servers test |

### Skills

| Method | Path | Status | Frontend | Backend |
|--------|------|--------|----------|---------|
| GET | `/api/skills` | wired | `hermes-skills.ts` | web_server |
| POST | `/api/skills` | wired | SkillsPanel / CronPanel | web_server |
| GET | `/api/skills/meta` | wired | SkillsPanel | web_server |
| POST | `/api/skills/sync` | wired | SkillsPanel | web_server |
| GET/PUT | `/api/skills/content` | wired | SkillsPanel | web_server |
| PUT | `/api/skills/toggle` | wired | SkillsPanel | web_server |
| DELETE | `/api/skills/{id}` | wired | SkillsPanel | web_server |
| GET | `/api/skills/hub/search` | wired | SkillsPanel | web_server |
| GET | `/api/skills/hub/sources` | wired | SkillsPanel | web_server |
| POST | `/api/skills/hub/install` | wired | SkillsPanel | web_server |
| POST | `/api/skills/hub/uninstall` | wired | SkillsPanel | web_server |
| POST | `/api/skills/hub/update` | wired | SkillsPanel | web_server |

### Config / model / env (Settings)

| Method | Path | Status | Frontend | Backend |
|--------|------|--------|----------|---------|
| GET/PUT | `/api/config` | wired | `settings-hermes.ts` | web_server |
| GET | `/api/config/schema` | wired | settings load | public |
| GET | `/api/config/defaults` | wired | settings load | public |
| GET/PUT | `/api/env` | wired | settings load/save | web_server |
| GET | `/api/model/info` | wired | settings / footer | public |
| GET | `/api/model/auxiliary` | wired | settings | web_server |
| POST | `/api/model/set` | wired | settings save | web_server |

### Workspace / git

| Method | Path | Status | Frontend | Backend |
|--------|------|--------|----------|---------|
| GET | `/api/fs/default-cwd` | wired | WorkspacePanel | web_server |
| GET | `/api/fs/list` | wired | WorkspacePanel | web_server |
| GET | `/api/fs/read-text` | wired | WorkspacePanel | web_server |
| GET | `/api/fs/read-data-url` | wired | image preview | web_server |
| POST | `/api/fs/write-text` | wired | upload / editor | web_server |
| PUT | `/api/workspace/file` | alias | A2UI create_document | → write-text |
| GET | `/api/git/status` | wired | WorkspacePanel | web_server |

### Cron

| Method | Path | Status | Frontend | Backend |
|--------|------|--------|----------|---------|
| GET | `/api/cron/jobs` | wired | CronPanel | web_server |
| POST | `/api/cron/jobs` | wired | CronPanel | web_server |
| PUT | `/api/cron/jobs/{id}` | wired | CronPanel | web_server |
| DELETE | `/api/cron/jobs/{id}` | wired | CronPanel | web_server |
| POST | `/api/cron/jobs/{id}/pause` | wired | CronPanel | web_server |
| POST | `/api/cron/jobs/{id}/resume` | wired | CronPanel | web_server |
| POST | `/api/cron/jobs/{id}/trigger` | wired | CronPanel | web_server |
| GET | `/api/cron/jobs/{id}/runs` | wired | CronPanel | web_server |
| POST | `/api/cron` | alias | A2UI create_cron | → jobs |
| POST | `/api/cron/wizard/preview` | **missing** | CronPanel | port from other backend |

### Memory / search / kanban

| Method | Path | Status | Frontend | Backend |
|--------|------|--------|----------|---------|
| GET/POST | `/api/memory/entries` | wired | MemoryPanel / A2UI | `marko_memory_api.py` |
| PATCH/DELETE | `/api/memory/entries/{id}` | wired | MemoryPanel / A2UI | same |
| GET | `/api/search` | wired | Sessions/Memory panels | same |
| GET/POST | `/api/kanban/tasks` | wired | KanbanPanel | `marko_kanban.py` |
| GET | `/api/kanban/status-counts` | wired | KanbanPanel | same |
| POST | `/api/kanban/tasks/{id}/move` | wired | KanbanPanel | same |
| DELETE | `/api/kanban/tasks/{id}` | wired | KanbanPanel | same |

### Auth (Marko login page vs Hermes)

| Method | Path | Status | Frontend | Notes |
|--------|------|--------|----------|-------|
| GET | `/api/auth/get-session` | **missing** | AppShell | Hermes has `/api/auth/me` instead |
| POST | `/api/auth/sign-in/ldap` | **missing** | login.tsx | Port or remap |
| POST | `/api/auth/sign-in/email` | **missing** | login.tsx | Port or remap |
| GET | `/api/auth/sign-in/social` | **missing** | login.tsx | Port or remap |
| GET | `/api/auth/me` | unused by Marko | — | Hermes native |
| GET | `/api/auth/providers` | unused by Marko | — | Hermes native |

### Not mounted on Hermes yet (UI still calls — integrate from other system)

| Method | Path | Status | Frontend | Notes |
|--------|------|--------|----------|-------|
| GET/PUT | `/api/approval/config` | **missing** | Settings, agui client | Port from other backend |
| POST | `/api/approval/resolve` | **missing** | ApprovalCard | Port from other backend |
| GET/PUT | `/api/cowork/setup` | **missing** | Cowork / Connections | Port from other backend |
| GET/POST | `/api/cowork/tasks` | **missing** | CoworkWorkRequests / A2UI | Port from other backend |
| GET | `/api/cowork/tasks/{id}` | **missing** | CoworkWorkRequests | Port from other backend |
| POST | `/api/cowork/tasks/{id}/abort` | **missing** | CoworkWorkRequests | Port from other backend |
| GET | `/api/office/config` | **missing** | BriefingPanel / login | Port from other backend |
| GET | `/api/office/status` | **missing** | BriefingPanel | Port from other backend |
| GET | `/api/office/briefing` | **missing** | BriefingPanel | Port from other backend |
| GET | `/api/office/sso` | **missing** | BriefingPanel / login | OAuth redirect |
| POST | `/api/office/disconnect` | **missing** | BriefingPanel | Port from other backend |
| GET | `/api/debug/health` | **missing** | DebugReplayPanel | Port from other backend |
| GET | `/api/debug/runs` | **missing** | DebugReplayPanel | Port from other backend |
| GET | `/api/debug/runs/{id}/events` | **missing** | DebugReplayPanel | Port from other backend |

These families should appear in the other backend’s OpenAPI; copy handlers here,
then set capability prefixes so the rail/panels light up automatically.

---

## Hermes OpenAPI paths not used by Marko

Hermes exposes ~250 routes. Marko only uses the tables above. Everything else
(ops, gateway, messaging platforms, plugins hub, curator, credentials pool,
dashboard themes, etc.) is **Hermes-native** and does not need UI wiring unless
you intentionally add a Marko panel.

Diff strategy:

```bash
# Their backend
curl -sS "$OTHER/openapi.json" | jq -r '.paths|keys[]' | sort > /tmp/other-paths.txt
# This repo’s Hermes
curl -sS -H "X-Hermes-Session-Token: $TOKEN" http://127.0.0.1:9119/openapi.json \
  | jq -r '.paths|keys[]' | sort > /tmp/this-paths.txt
comm -23 /tmp/other-paths.txt /tmp/this-paths.txt   # only in other → port candidates
comm -13 /tmp/other-paths.txt /tmp/this-paths.txt   # only here
```

---

## Smoke checklist (one-hop Hermes)

```bash
# Preferred: build UI into web_dist + start Hermes only (no Next proxy)
bash scripts/start-hermes-ui.sh

# Checks (same origin)
curl -sS http://127.0.0.1:9119/api/health
curl -sS http://127.0.0.1:9119/ | grep -o '__HERMES_SESSION_TOKEN__="[^"]*"'
TOKEN=$(curl -sS http://127.0.0.1:9119/api/marko/boot | jq -r .token)
curl -sS -H "X-Hermes-Session-Token: $TOKEN" \
  http://127.0.0.1:9119/api/capabilities | jq '.features'
curl -sS -H "X-Hermes-Session-Token: $TOKEN" \
  http://127.0.0.1:9119/api/fs/default-cwd

# Validate this sheet against UI callers + OpenAPI
npm run validate:api-map
```

Expected: health `200`, token present, capabilities `features.agui/sessions/workspace/...` true;
`office` / `cowork` / `approval` / `debug` false until those routes are ported.

Open UI: **http://127.0.0.1:9119/** (Cursor Ports → 9119).

---

## Validate this file (no missing APIs)

Canonical inventory below is checked against every `ui/src` `/api/*` + `/agui` call:

```bash
npm run validate:api-map
# or
python3 scripts/validate_api_mapping.py --hermes http://127.0.0.1:9119
```

- **Fails** if any UI path is absent from the inventory (or inventory path missing from prose tables).
- **Warns** if inventory paths are stale / unexpected OpenAPI gaps (known-missing families exempt).

When you add a frontend API call, add a row to the tables **and** a `METHOD /path` line in the inventory.

<!-- BEGIN_API_INVENTORY -->
```
POST /agui
GET/PUT /api/approval/config
POST /api/approval/resolve
GET /api/auth/get-session
GET /api/auth/me
GET /api/auth/providers
POST /api/auth/sign-in/email
POST /api/auth/sign-in/ldap
GET /api/auth/sign-in/social
GET/POST /api/capabilities
POST /api/capabilities/warm
GET/PUT /api/config
GET /api/config/defaults
GET /api/config/schema
GET/PUT /api/cowork/setup
GET/POST /api/cowork/tasks
GET /api/cowork/tasks/{id}
POST /api/cowork/tasks/{id}/abort
POST /api/cron
GET/POST /api/cron/jobs
DELETE/PUT /api/cron/jobs/{id}
POST /api/cron/jobs/{id}/pause
POST /api/cron/jobs/{id}/resume
GET /api/cron/jobs/{id}/runs
POST /api/cron/jobs/{id}/trigger
POST /api/cron/wizard/preview
GET /api/debug/health
GET /api/debug/runs
GET /api/debug/runs/{id}/events
GET/PUT /api/env
GET /api/fs/default-cwd
GET /api/fs/list
GET /api/fs/read-data-url
GET /api/fs/read-text
POST /api/fs/write-text
GET /api/git/status
GET /api/health
GET /api/kanban/status-counts
GET/POST /api/kanban/tasks
DELETE /api/kanban/tasks/{id}
POST /api/kanban/tasks/{id}/move
GET /api/marko/boot
GET /api/mcp
GET/POST/PUT /api/mcp/servers
DELETE /api/mcp/servers/{id}
PUT /api/mcp/servers/{id}/enabled
GET /api/mcp/servers/{id}/events
POST /api/mcp/servers/{id}/test
POST /api/mcp/{id}/test
GET/POST /api/memory/entries
DELETE/PATCH /api/memory/entries/{id}
GET /api/model/auxiliary
GET /api/model/info
POST /api/model/set
GET /api/office/briefing
GET /api/office/config
POST /api/office/disconnect
GET /api/office/sso
GET /api/office/status
GET/POST /api/profiles
DELETE/PATCH /api/profiles/{id}
POST /api/profiles/{id}/default
GET /api/search
GET/POST /api/sessions
GET /api/sessions/search
DELETE/PATCH /api/sessions/{id}
GET /api/sessions/{id}/live
GET /api/sessions/{id}/messages
GET /api/settings
GET/POST /api/skills
GET/PUT /api/skills/content
POST /api/skills/hub/install
GET /api/skills/hub/search
GET /api/skills/hub/sources
POST /api/skills/hub/uninstall
POST /api/skills/hub/update
GET /api/skills/meta
POST /api/skills/sync
PUT /api/skills/toggle
DELETE /api/skills/{id}
PUT /api/workspace/file
GET /docs
GET /openapi.json
```
<!-- END_API_INVENTORY -->
