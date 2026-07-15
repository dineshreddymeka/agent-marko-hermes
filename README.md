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

## Quick start (dev) — one-hop, no proxy

Browser talks **directly to Hermes** (UI + `/api/*` + `/agui`). No Next rewrite
proxy and no Cloudflare tunnel.

```bash
# from repo root — builds Marko into hermes/hermes_cli/web_dist and starts Hermes
bash scripts/start-hermes-ui.sh
```

Open **http://127.0.0.1:9119/** (Cursor → Ports → forward **9119**).

Swagger: http://127.0.0.1:9119/docs

### Optional: Next.js HMR only (local iteration)

```bash
# Terminal A — Hermes API/UI backend
cd hermes && PYTHONPATH=. python3 -m hermes_cli.main dashboard --no-open --skip-build

# Terminal B — Next HMR (rewrites /api+/agui → :9119). Not required for preview.
npm run dev:ui   # http://127.0.0.1:5173
```

## Production build

```bash
npm run build:ui
# writes Next export → hermes/hermes_cli/web_dist
cd hermes
PYTHONPATH=. python3 -m hermes_cli.main dashboard --no-open --skip-build
```

Marko is served same-origin from Hermes. Chat hits `POST /agui` in-process.

### Direct Next.js ↔ Hermes

- **Preferred preview:** Hermes alone on `:9119` (static export + APIs). **No proxy.**
- **Optional HMR:** Next on `:5173` rewrites `/api/*` + `/agui` → Hermes `:9119`.
- **Discovery:** Hermes Swagger at `/docs` + schema `/openapi.json`. Marko reads `/api/capabilities` (OpenAPI-derived `features` map) to know which panels/APIs exist.
- **Full route map:** see [`docs/marko-ui-features/API_MAPPING.md`](docs/marko-ui-features/API_MAPPING.md) for every frontend↔backend path, aliases, missing routes to port from another Hermes, and an OpenAPI diff checklist.
- **Feature docs (titles, forms, working chrome, AG-UI, porting plan):** [`docs/marko-ui-features/`](docs/marko-ui-features/README.md)
- **Validate the map:** `npm run validate:api-map` fails if any UI `/api/*` or `/agui` call is missing from the MD inventory.

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
