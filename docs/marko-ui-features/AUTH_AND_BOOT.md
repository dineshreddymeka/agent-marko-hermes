# Auth & Boot — Detailed Implementation

## Goal

Authenticate Marko API and AG-UI calls without embedding secrets in the SPA bundle. Production path: Hermes injects an ephemeral session token into served HTML.

## Bootstrap sequence

```
1. Browser GET /
2. Hermes serves index.html with inline:
     window.__HERMES_SESSION_TOKEN__ = "…"
     window.__HERMES_BASE_PATH__ = "…"      (optional)
     window.__HERMES_AUTH_REQUIRED__ = true/false
3. SPA boots → hermesAuthHeaders() reads token
4. All /api/* and /agui requests send:
     X-Hermes-Session-Token: <token>
5. If token missing (HMR): GET /api/marko/boot (loopback-only) to fetch token
```

## Backend

### Token injection

**File:** `hermes/hermes_cli/web_server.py` (SPA index HTML rewrite)

Inject before `</head>` or early in `<body>`:

```html
<script>
  window.__HERMES_SESSION_TOKEN__ = "…";
  window.__HERMES_AUTH_REQUIRED__ = false;
</script>
```

### Public paths

**File:** `hermes/hermes_cli/dashboard_auth/public_paths.py`

Must allow unauthenticated access to at least:

- `GET /api/health`
- `GET /api/status` (if used)
- `GET /api/marko/boot` (loopback)

### Marko boot

`GET /api/marko/boot` → `{ token, authRequired }` for local HMR when injection is absent.

### Gated OAuth mode

When auth is required:

- Cookie session instead of (or in addition to) injected token
- Unauthenticated `/agui` and `/api/*` return 401 JSON
- UI routes to `/login`

## Frontend

### Headers

**File:** `ui/src/lib/api.ts`

```ts
export function hermesAuthHeaders(): HeadersInit {
  const token = window.__HERMES_SESSION_TOKEN__
  return token ? { 'X-Hermes-Session-Token': token } : {}
}
```

Use on:

- `apiClient` REST calls
- `fetch('/agui', …)` / HttpAgent headers
- A2UI action fetches

### Boot helper

**File:** `ui/src/lib/hermes-boot.ts` (or providers)

If `!window.__HERMES_SESSION_TOKEN__ && !window.__HERMES_AUTH_REQUIRED__`:

```ts
const res = await fetch('/api/marko/boot', { credentials: 'include' })
const data = await res.json()
if (data.token) window.__HERMES_SESSION_TOKEN__ = data.token
```

### 401 handling

On API 401 with `login_url` in body → `window.location.assign(login_url)`.

### Login route

**File:** `ui/src/routes/login.tsx`

Gate `AppShell` when `authRequired` and no session.

> Note: some Marko login endpoints may differ from Hermes (`/api/auth/me` vs Marko-shaped paths). Port carefully against [API_MAPPING.md](./API_MAPPING.md) “Auth (missing)” rows.

## Implementation steps

1. Implement public path allowlist.
2. Generate ephemeral dashboard session token per browser session.
3. Inject into SPA HTML on every `/` response.
4. Frontend reads token into headers.
5. Add loopback `/api/marko/boot` for HMR.
6. Add 401 → login redirect.
7. Smoke: load `:9119/`, Network tab shows token header on `/api/sessions`.

## Acceptance

- [ ] Production SPA has injected token; API calls succeed.
- [ ] HMR without injection can boot via `/api/marko/boot`.
- [ ] Health remains public.
- [ ] Gated mode redirects unauthenticated users to login.

## Reference files

| Layer | Path |
|-------|------|
| Injection | `hermes/hermes_cli/web_server.py` |
| Public paths | `hermes/hermes_cli/dashboard_auth/public_paths.py` |
| API client | `ui/src/lib/api.ts` |
| Boot | `ui/src/lib/hermes-boot.ts` / providers |
| Login | `ui/src/routes/login.tsx` |
| Shell gate | `ui/src/components/shell/AppShell.tsx` |
