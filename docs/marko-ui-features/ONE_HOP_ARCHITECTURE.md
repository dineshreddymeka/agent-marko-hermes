# One-Hop Architecture — Detailed Implementation

## Goal

The browser talks **only** to one backend origin. That backend serves:

1. Static Marko SPA (Next.js `output: 'export'`)
2. REST `/api/*`
3. AG-UI chat `POST /agui` (SSE)

There is **no** Bun/Node BFF and **no** Cloudflare tunnel required for normal preview.

```
┌──────────────────────────────────────────────┐
│ Browser (Marko SPA)                          │
│   GET  /              → index.html + assets  │
│   REST /api/*                                │
│   SSE  POST /agui                            │
└──────────────────────┬───────────────────────┘
                       │ same origin
┌──────────────────────▼───────────────────────┐
│ Hermes FastAPI (:9119)                       │
│   mount_spa(web_dist)                        │
│   web_server.py routes                       │
│   agui_endpoint.py agent loop                │
└──────────────────────────────────────────────┘
```

## Backend implementation

### 1. Build UI into `web_dist`

```bash
npm run build:ui
# next build (export) → ui/out → hermes/hermes_cli/web_dist
```

- Script: `ui/scripts/copy-web-dist.mjs`
- Override dir: `HERMES_WEB_DIST`
- One-shot preview: `bash scripts/start-hermes-ui.sh`

### 2. Mount SPA on FastAPI

**File:** `hermes/hermes_cli/web_server.py`

- Serve `web_dist/index.html` for `/` and SPA fallbacks.
- Serve `/_next/static/*` and other export assets.
- Inject bootstrap script into `index.html` (see [AUTH_AND_BOOT.md](./AUTH_AND_BOOT.md)).

### 3. Mount AG-UI router

```python
# web_server.py
app.include_router(agui_endpoint.router)  # POST /agui
```

### 4. Platform gate during AG-UI

```python
os.environ["HERMES_PLATFORM"] = "marko"
# … AIAgent.run_conversation …
# restore previous value in finally
```

This unlocks Marko frontend tools and Marko-oriented tool check_fns.

## Frontend implementation

### 1. Same-origin API client

**File:** `ui/src/lib/api.ts`

- All fetches use relative paths (`/api/...`, `/agui`).
- Never hard-code Hermes host in browser code.
- Attach `X-Hermes-Session-Token` via `hermesAuthHeaders()`.

### 2. Next config

**File:** `ui/next.config.ts`

- Production: `output: 'export'` (no rewrite proxy).
- Optional HMR only: rewrite `/api/*` and `/agui` → `HERMES_URL` (default `http://127.0.0.1:9119`).

### 3. Preferred vs optional ports

| Mode | URL | Notes |
|------|-----|-------|
| Preferred | `http://127.0.0.1:9119/` | Hermes serves SPA + APIs |
| Optional HMR | `http://127.0.0.1:5173/` | Next rewrites to Hermes |

Do **not** tell users to use `:5173` for normal preview.

## Session identity

- Marko sessions use UUID `threadId` = session id.
- Backend `ensure_marko_session(db, thread_id, source="marko")` on each `/agui` run.
- File: `hermes/hermes_cli/marko_session.py`

## Porting checklist

- [ ] Static export build copies into backend static root
- [ ] Backend injects session token into `index.html`
- [ ] `/api/health` returns 200 without auth (or documented public path)
- [ ] `/agui` streams SSE from same origin
- [ ] UI uses relative URLs only
- [ ] Dev proxy optional and disabled for export builds

## Reference files

| Concern | Path |
|---------|------|
| FastAPI app | `hermes/hermes_cli/web_server.py` |
| AG-UI | `hermes/hermes_cli/agui_endpoint.py` |
| Start script | `scripts/start-hermes-ui.sh` |
| Copy dist | `ui/scripts/copy-web-dist.mjs` |
| API client | `ui/src/lib/api.ts` |
| Next config | `ui/next.config.ts` |
