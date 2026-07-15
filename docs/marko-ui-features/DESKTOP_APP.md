# Desktop App Plan — Marko as a native desktop product

**Audience:** product + engineering. **Status:** plan only.
**Baseline:** Marko runs today as a **browser SPA** served by Hermes
(`http://127.0.0.1:9119/`). Hermes upstream has an **Electron desktop**
(`hermes desktop` / `hermes gui`) with a **different** UI
(`@assistant-ui`) and transport (JSON-RPC / `tui_gateway`) — and that
`apps/desktop/` tree is **not present** in this Marko monorepo checkout.

Goal: ship Marko + Hermes as an installable desktop app that feels like
Cursor / Slack / ChatGPT Desktop — single icon, local backend, OS
integration — **without** abandoning the one-hop AG-UI architecture.

Related:
- [BEDROCK_AGENTCORE_INTEGRATION.md](./BEDROCK_AGENTCORE_INTEGRATION.md) — desktop shell can still use AgentCore as the agent backend.
- [HARNESS_PERFORMANCE.md](./HARNESS_PERFORMANCE.md) — keep Marko↔Hermes latency low inside the WebView.
- [ONE_HOP_ARCHITECTURE.md](./ONE_HOP_ARCHITECTURE.md) — WebView must remain same-origin to Hermes (no extra proxy).

---

## 0. What “works like a desktop app” means

| Capability | Browser today | Desktop product target |
|---|---|---|
| Launch | Terminal + open URL | Double-click icon / Start Menu / Dock |
| Window | Browser tab | Dedicated OS window (frameless optional) |
| Backend | Manual `start-hermes-ui.sh` | App starts Hermes child, waits for ready, opens UI |
| Quit | Close tab (backend may keep running) | Quit app → stop backend cleanly |
| Updates | `git pull` / rebuild | In-app or silent auto-update |
| OS integration | Limited | Tray, notifications, deep links, file open, autostart |
| Offline shell | Needs network to localhost | Works offline for UI; agent needs model/network |
| Enterprise | Browser policies | Code-signed installers, managed deploy (Intune/Jamf) |

---

## 1. Current state (facts)

### Marko one-hop (this repo — works)

```
Browser → Hermes :9119
  GET /           → hermes_cli/web_dist (Next static export)
  REST /api/*
  SSE  POST /agui → AIAgent (or future AgentCore)
```

Launch: `bash scripts/start-hermes-ui.sh` → open `http://127.0.0.1:9119/`.

### Hermes Electron desktop (upstream — not Marko)

```
Electron + @assistant-ui renderer
  → spawns `hermes serve` (HERMES_SERVE_HEADLESS=1 — no web_dist)
  → tui_gateway JSON-RPC (not AG-UI)
```

CLI: `hermes desktop` / `hermes gui`. Packaging: electron-builder,
install.sh/ps1, Nix, ad-hoc macOS signing, self-rebuild update path.
Sources expected at `hermes/apps/desktop/` — **missing in this checkout**.

### What we must not do
- Replace Marko with the upstream assistant-ui renderer.
- Point Electron at `hermes serve` headless (that disables Marko SPA).
- Put a second HTTP proxy between the WebView and Hermes (breaks one-hop).

---

## 2. Recommended architecture (ranked)

### Option A — Thin Electron shell → Hermes-served Marko (**recommended**)

```
┌──────────────────────────────────────────┐
│  Marko Desktop (Electron)                │
│  ┌────────────────────────────────────┐  │
│  │ BrowserWindow                      │  │
│  │   loadURL http://127.0.0.1:<port>/ │  │
│  │   (Marko web_dist via Hermes)      │  │
│  └────────────────────────────────────┘  │
│  main process:                           │
│    - spawn Hermes dashboard child        │
│    - wait HERMES_DESKTOP_READY_FILE      │
│    - tray / notifications / deep links   │
│    - auto-update                         │
└──────────────────┬───────────────────────┘
                   │ same-origin REST + /agui
                   ▼
         Hermes FastAPI (dashboard, SPA mounted)
                   │
                   ▼
         AIAgent local  OR  AgentCore (profile)
```

**Why this wins**
- Zero change to Marko React code for v1 (same AG-UI, A2UI, panels).
- Reuses Hermes desktop spawn/signing/update lessons (`HERMES_DESKTOP=*`).
- One-hop preserved: WebView talks to Hermes exactly like Chrome does.
- electron-builder installers (DMG / NSIS / AppImage) are enterprise-familiar
  (Jamf/Intune friendly).

### Option B — PWA “Install app” from `:9119`
Fastest prototype; weak as a product (no tray, poor deep links, no
bundled backend lifecycle). Keep as a **bonus** after Option A.

### Option C — Tauri thin shell
Smaller binaries; greenfield vs Hermes’ mature Electron path. Consider
only if binary size / memory becomes a hard requirement.

### Option D — Adopt upstream Hermes Electron as-is
Wrong UI and wrong transport for Marko. Reject for this product.

**Decision to lock:** Option A.

---

## 3. Product surfaces (desktop-specific)

| Surface | Behavior |
|---|---|
| **Main window** | Marko SPA; optional custom title bar (macOS traffic lights inset) |
| **Splash / boot** | Show “Starting Hermes…” until ready-file JSON; surface port + errors |
| **System tray** | Show/hide window; “New chat”; Quit; optional unread badge |
| **OS notifications** | Run finished, approval needed, cron fired — via Electron `Notification` + Marko bridge |
| **Deep links** | `marko://chat/<sessionId>`, `marko://panel/<name>` registered at install |
| **File open** | Drag-drop already in Marko; plus `open-file` from OS → composer attachment |
| **Autostart** | Optional “Launch at login” (enterprise default off) |
| **Single instance** | Second launch focuses existing window (Electron `requestSingleInstanceLock`) |
| **DevTools** | Hidden in prod; `MARKO_DESKTOP_DEBUG=1` enables |

---

## 4. Backend lifecycle (critical path)

Mirror Hermes desktop contracts already in `web_server.py`:

1. Main process picks a free loopback port (or fixed `9119` if free).
2. Sets env:
   - `HERMES_DESKTOP=1`
   - `HERMES_DESKTOP_READY_FILE=<tmp path>`
   - `HERMES_PLATFORM` not required (Marko set per `/agui` request)
3. Spawns:
   ```bash
   python -m hermes_cli.main dashboard \
     --host 127.0.0.1 --port <port> --no-open --skip-build
   ```
   (SPA must be pre-bundled into `web_dist` inside the app resources.)
4. Polls ready file (JSON with port/pid) — same handshake as upstream Electron.
5. `BrowserWindow.loadURL(http://127.0.0.1:<port>/)`.
6. On quit: SIGTERM child → wait → SIGKILL; delete ready file.
7. Crash of child → show recovery UI + “Restart backend” button.

**Packaging note:** ship a **frozen** Marko `web_dist` + Hermes Python
environment (venv or PyInstaller/embedded CPython). Prefer:
- **Dev:** system Python + repo checkout.
- **Prod installer:** embed `web_dist` + use `uv`/`pip` venv next to the app,
  or rely on `hermes` already on PATH for “developer desktop”; for
  enterprise “employee desktop”, bundle a private venv under
  `Resources/hermes-runtime/`.

---

## 5. Repo layout (proposed)

```
desktop/                          # NEW — Marko Electron shell
  package.json                    # electron, electron-builder
  electron/
    main.ts                       # spawn Hermes, window, tray, deep links
    preload.ts                    # contextBridge: notify, openExternal, versions
    updater.ts                    # electron-updater or Hermes-style rebuild
  entitlements.mac.plist
  electron-builder.yml
  scripts/pack.mjs

ui/                               # unchanged Marko (minor bridges only)
  src/lib/desktop-bridge.ts       # feature-detect window.markoDesktop

hermes/                           # reuse HERMES_DESKTOP ready-file path
scripts/start-marko-desktop.sh    # dev: electron . against local Hermes
```

Optional later: restore/adapt upstream `hermes/apps/desktop` as a
**template** for spawn/signing only — do not keep its renderer.

---

## 6. Marko ↔ desktop bridge (minimal UI changes)

```ts
// preload → window.markoDesktop
type MarkoDesktopApi = {
  isDesktop: true
  notify(title: string, body: string): Promise<void>
  setBadge(count: number): void
  openExternal(url: string): Promise<void>
  getVersion(): string
  onDeepLink(cb: (url: string) => void): void
}
```

| Marko feature | Desktop wiring |
|---|---|
| Approval needed | `notify("Approval required", …)` + badge |
| `RUN_FINISHED` | Optional quiet notify if window blurred |
| External links | `openExternal` (never navigate WebView away) |
| Deep link `marko://chat/…` | Router navigates to session |
| Settings | “Launch at login”, “Tray icon”, update channel |

No bridge required for chat itself — AG-UI stays same-origin fetch/SSE.

---

## 7. Packaging & release

| Platform | Artifact | Notes |
|---|---|---|
| macOS | `.dmg` + `.zip` (auto-update) | Developer ID + notarization for enterprise; ad-hoc OK for internal dogfood |
| Windows | NSIS `.exe` / MSIX | Code signing cert; Intune-friendly |
| Linux | AppImage + `.deb` | Optional |

**Versioning:** single version across Electron shell + embedded `web_dist`
stamp + Hermes runtime pin (show in Marko Settings → About).

**Auto-update options (pick in Phase 2):**
1. **`electron-updater` + GitHub/S3 releases** — standard for Electron products.
2. **Hermes-style `marko-desktop --build-only`** — rebuild from source on machine (dev-centric, weak for employees).

Enterprise default: (1) with signed artifacts in a private S3/CodeArtifact bucket.

---

## 8. Security

- WebView loads **loopback only**; block navigation to non-local origins
  except `openExternal`.
- `contextIsolation: true`, `nodeIntegration: false`, strict preload API.
- Hermes binds `127.0.0.1` only (never `0.0.0.0` in desktop mode).
- Session token stays in Hermes-injected `index.html` / cookie — same as browser one-hop.
- No AWS keys in the renderer (AgentCore via Hermes IRSA/SSO — see AgentCore plan).
- Code signing + notarization before wide employee rollout.
- Optional: enterprise config plist/registry for forced AgentCore endpoint / IdP.

---

## 9. Implementation phases

### Phase 0 — Decision & skeleton
- ADR: Electron thin shell over Marko one-hop (this doc).
- Create `desktop/` with empty `BrowserWindow` loading `http://127.0.0.1:9119`.
- Dev script assumes Hermes already running (`start-hermes-ui.sh`).
- **Exit:** `npm run desktop` opens Marko in Electron.

### Phase 1 — Managed backend lifecycle
- Spawn `hermes dashboard --skip-build` with `HERMES_DESKTOP=1` + ready file.
- Bundle/copy `web_dist` into app resources for prod runs.
- Splash screen + crash recovery.
- Single-instance lock.
- **Exit:** double-click (dev) starts backend + UI with no terminal.

### Phase 2 — OS integration
- Tray, notifications bridge, badge, deep links, open-external, autostart toggle.
- Marko `desktop-bridge.ts` + Settings panel section.
- **Exit:** feels like a desktop agent (notify on approval, reopen from tray).

### Phase 3 — Installers & updates
- electron-builder configs for mac/win/linux.
- CI job: build signed artifacts (internal cert first).
- `electron-updater` channel (beta/prod).
- **Exit:** employees install from company portal without Node/Python knowledge
  (runtime bundled or pre-req documented).

### Phase 4 — Enterprise hardening
- Jamf/Intune deploy docs; forced settings via MDM.
- AgentCore profile baked for corp (link to AgentCore plan).
- GPU flags / sandbox fallbacks (reuse Hermes `desktop.disable_gpu` patterns).
- Telemetry opt-in aligned with corp policy.
- **Exit:** managed fleet ready.

### Phase 5 — Polish (optional)
- Custom title bar / traffic-light inset.
- Offline static shell + “backend starting” resilience.
- PWA fallback for browser-only users.
- Touch Bar / Windows Jump List “New chat”.

---

## 10. File / command checklist (when implementing)

| Item | Action |
|---|---|
| `desktop/electron/main.ts` | Window + spawn + tray + deep links |
| `desktop/electron/preload.ts` | `markoDesktop` bridge |
| `desktop/electron-builder.yml` | Targets, publish config |
| `ui/src/lib/desktop-bridge.ts` | Safe feature detect |
| `ui/.../Settings` | Desktop section |
| `scripts/start-marko-desktop.sh` | Dev launcher |
| `hermes_cli/web_server.py` | Confirm ready-file handshake works with `dashboard` (already present for Electron) |
| `docs/marko-ui-features/ONE_HOP_ARCHITECTURE.md` | Add “Desktop WebView is still one-hop” note |
| CI | `desktop-build` matrix (mac/win/linux) |

---

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Bundling Python is painful | Phase 1–2: require Hermes on PATH for dogfood; Phase 3: embed venv or use corporate Hermes MSI as dependency |
| Upstream `apps/desktop` returns and conflicts | Keep Marko shell in top-level `desktop/`; don’t overwrite Hermes assistant-ui app |
| SSE / EventSource quirks in Electron | Same Chromium as Chrome; if issues, use fetch-stream polyfill already used by AG-UI client |
| Two products (Hermes desktop vs Marko desktop) | Brand clearly: “Marko Desktop”; Hermes `gui` remains upstream optional |
| Large download (Electron + models runtime) | Don’t ship models; only shell + Hermes; AgentCore stays cloud |

---

## 12. Success metrics

| Metric | Target |
|---|---|
| Cold launch to interactive Marko | < 5 s on warm machine (web_dist prebuilt) |
| Backend crash recovery | User recovers in one click |
| Approval notification when unfocused | < 1 s after event |
| Deep link opens correct session | 100% |
| Unsigned→signed internal dogfood | Phase 3 |

---

## 13. Smallest vertical slice (do this first)

1. `desktop/` Electron app that only `loadURL('http://127.0.0.1:9119')`.
2. Document: run `start-hermes-ui.sh` then `npm run desktop`.
3. Add tray “Show / Quit”.
4. Demo to stakeholders — then invest in spawn + installers.

That proves “feels like an app” before solving Python bundling.

---

## 14. How this fits AgentCore

Desktop does **not** change the agent backend story:

- Profile `hermes-local` → in-process `AIAgent` (laptop dogfood).
- Profile `agentcore` → Hermes adapter → Bedrock AgentCore (enterprise).

The desktop shell only owns **window + process lifecycle + OS chrome**.
Agent security/governance stays in Hermes + AgentCore plans.
