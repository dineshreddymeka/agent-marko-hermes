# Agent-Marko UI + Hermes Agent backend
#
# One-hop architecture: Browser Marko SPA ↔ Hermes FastAPI only.
# No orchestration middle layer.

**Author integration:** Agent-Marko (Open Jarvis UI) on Hermes Agent `web_server`.

## Architecture

```
Browser (Marko React / Next.js static export)
   │  REST /api/*  +  AG-UI POST /agui (SSE)
   ▼
Hermes FastAPI (hermes_cli/web_server.py :9119)
   │
   ▼
AIAgent / sessions DB / tools
```

Latency rules: same process for chat + REST; prod SPA served from Hermes `web_dist`.

## Layout

```
agent-marko-hermes/
  hermes/           # Hermes Agent (Python)
  ui/               # Agent-Marko React app (Next.js)
  packages/shared/  # shared TS types
  scripts/          # build/dev/smoke helpers
```

## Quick start (dev)

### 1. Hermes backend

```bash
cd hermes
# install deps per upstream Hermes README / pyproject.toml
PYTHONPATH=. python3 -m hermes_cli.main dashboard --no-open --skip-build
```

Dashboard API: `http://127.0.0.1:9119`

### 2. Marko UI

```bash
# from repo root
npm install
npm run dev:ui
```

Open `http://127.0.0.1:5173`. Next.js rewrites `/api` and `/agui` → `:9119`.
On boot the UI calls `GET /api/marko/boot` (loopback-only) to obtain
`X-Hermes-Session-Token` (same token Hermes injects into production `index.html`).

## Production build

```bash
npm run build:ui
# writes Next export → hermes/hermes_cli/web_dist
cd hermes
PYTHONPATH=. python3 -m hermes_cli.main dashboard --no-open --skip-build
```

Marko is served same-origin from Hermes. Chat hits `POST /agui` in-process.

### Direct Next.js ↔ Hermes

- **Dev:** Next on `:5173` rewrites `/api/*` + `/agui` → Hermes `:9119` (browser still uses same-origin paths).
- **Prod:** static export is mounted by Hermes — no Next Node process; still one-hop Browser → Hermes.
- **Discovery:** Hermes Swagger at `/docs` + schema `/openapi.json`. Marko reads `/api/capabilities` (OpenAPI-derived `features` map) to know which panels/APIs exist.

### AG-UI + A2UI

- Hermes streams text, thinking, tools, and `CUSTOM a2ui.message` over `/agui`
- Model tool `a2ui_render` (+ Marko frontend tools) available when `HERMES_PLATFORM=marko`
- A2UI actions use `/api/cron`, `/api/workspace/file`, memory routes, then actionResponse on the same thread
- Persisted messages include `a2ui` JSON for reload hydration

## Auth

| Mode | Behavior |
|------|----------|
| Loopback | Ephemeral session token via HTML injection or `/api/marko/boot` |
| Gated OAuth | Cookie auth; `/agui` returns 401 JSON like `/api/*` |

Header: `X-Hermes-Session-Token`

## Descoped (OJ Postgres-only surfaces)

- Some OJ-only office/cowork flows when Hermes has no equivalent
- Check panel empty-states for current descoped list

## Tests

```bash
npm test
```
