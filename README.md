# Agent-Marko UI + Hermes Agent backend
#
# One-hop architecture: Browser Marko SPA ↔ Hermes FastAPI only.
# No Bun orchestration server, no bridge microservice.

**Author integration:** Agent-Marko (Open Jarvis UI) on Hermes Agent `web_server`.

## Architecture

```
Browser (Marko React)
   │  REST /api/*  +  AG-UI POST /agui (SSE)
   ▼
Hermes FastAPI (hermes_cli/web_server.py :9119)
   │
   ▼
AIAgent / sessions DB / tools
```

Latency rules: same process for chat + REST; prod SPA served from Hermes `web_dist` (no Vite proxy hop).

## Layout

```
agent-marko-hermes/
  hermes/           # Hermes Agent (Python)
  ui/               # Agent-Marko React app (no Bun server/)
  packages/shared/  # shared TS types
  scripts/          # build/dev/smoke helpers
```

## Quick start (dev)

### 1. Hermes backend

```bash
cd hermes
# install deps per upstream Hermes README / pyproject.toml
python -m hermes_cli.main dashboard --no-open --skip-build
```

Dashboard API: `http://127.0.0.1:9119`

### 2. Marko UI

```bash
# from repo root (npm or bun)
npm install
npm run dev:ui
```

Open `http://127.0.0.1:5173`. Vite proxies `/api` and `/agui` → `:9119`.
On boot the UI calls `GET /api/marko/boot` (loopback-only) to obtain
`X-Hermes-Session-Token` (same token Hermes injects into production `index.html`).

## Production build

```bash
npm run build:ui
# writes ui build → hermes/hermes_cli/web_dist
cd hermes
python -m hermes_cli.main dashboard --no-open --skip-build
# or: hermes dashboard --skip-build
```

Marko is served same-origin from Hermes. Chat hits `POST /agui` in-process.

## Auth

| Mode | Behavior |
|------|----------|
| Loopback | Ephemeral session token via HTML injection or `/api/marko/boot` |
| Gated OAuth | Cookie auth; `/agui` returns 401 JSON like `/api/*` |

Header: `X-Hermes-Session-Token`

## Descoped (OJ Bun/Postgres only)

- Memory (pgvector) panel
- Office / Cowork
- better-auth user DB / OJ capabilities warm path

Use Hermes-native panels: Sessions, Skills, Cron/Tasks, MCP Connections (Hermes `/api/mcp`), Config/Settings where wired.

## Smoke

With Hermes running on `:9119`:

```bash
python scripts/smoke_agui.py
```

Expect SSE lines starting with `data: {"type": "RUN_STARTED"...}`.

## Success criteria

- Chat: browser → Hermes `/agui` → agent (one hop); text/tool events render in Marko
- Management: `/api/sessions`, config, skills, cron, status hit Hermes (not `:3001`)
- No Bun `server/` required to chat or list sessions
