# AionUi + Hermes Agent (ACP)

**Branch:** `cursor/aionui-backend-hermes-2581`  
**Status:** alternate frontend — Marko/`ui/` remains the one-hop SPA on `:9119`; this path uses [AionUi](https://github.com/iOfficeAI/AionUi) as the Cowork UI with **this repo’s Hermes** as an ACP agent backend.

## Architecture

```
Browser
   │
   ▼
AionUi WebUI  (aionui-web + bundled aioncore)   :25808
   │  ACP stdio:  hermes acp
   ▼
Hermes Agent  (this repo: hermes/)   ← AIAgent / tools / memory / skills
```

- AionUi keeps its own host process (`aioncore`) for auth, conversations UI, and agent orchestration.
- Hermes is **not** replaced by aioncore — it is the multi-agent backend AionUi launches via ACP when you select **Hermes Agent**.
- This matches upstream AionUi’s [ACP Setup](https://github.com/iOfficeAI/AionUi/wiki/ACP-Setup) + Hermes support (`hermes acp`).

## Quick start

```bash
bash scripts/start-aionui-hermes.sh
# Local:  http://127.0.0.1:25808/
# Public: trycloudflare.com URL (OPEN_TUNNEL=1 by default)
```

Skip tunnel:

```bash
OPEN_TUNNEL=0 bash scripts/start-aionui-hermes.sh
```

### First login

On a fresh install, the WebUI prints an initial admin username/password in the `aionui-web` tmux pane. Copy them, then log in at `http://127.0.0.1:25808/`.

Reset password later:

```bash
~/.local/share/aionui-web/aionui-web resetpass
```

### Select Hermes

AionUi **auto-detects** Hermes when `hermes` is on `PATH` (builtin ACP backend `hermes`, args `["acp"]`). The start script then pins `command_override` to `scripts/bin/hermes` (Python shim) so aioncore always launches **this checkout**.

1. Open AionUi → assistant / agent selector.
2. Choose **Hermes**.
3. If status is offline with `No LLM provider configured`, set up Hermes auth/model first:

```bash
hermes setup model
# or: cd hermes && PYTHONPATH=. python3 -m hermes_cli.main setup model
```

Then re-run health check:

```bash
npm run seed:aionui-hermes
npm run smoke:aionui-hermes
```

Verified API surface (local WebUI, auth disabled in local mode):

| Endpoint | Expect |
|----------|--------|
| `GET /api/assistants` | entry with `agent.acp_backend == "hermes"` |
| `GET /api/agents/management` | `backend: hermes`, `args: ["acp"]`, `status: online` |
| `PUT /api/agents/{id}/overrides` | `{"command_override":"<repo>/scripts/bin/hermes"}` |
| `POST /api/agents/{id}/health-check` | `status: online` |

### Fixes landed for “offline / disconnected”

1. **Absolute shebang** on `scripts/bin/hermes` (`#!/usr/bin/python3`) — aioncore clears PATH and blocks PATH overrides.
2. **PATH quoting** in `start-aionui-hermes.sh` — no more literal `$PATH` inherited by aioncore.
3. **Deferred ACP agent** — `session/new` succeeds without a configured LLM provider; the agent is built on first prompt (`ensure_agent`). Health-check can mark Hermes **online** before `hermes setup model`.

## Env knobs

| Variable | Default | Meaning |
|----------|---------|---------|
| `AIONUI_PORT` | `25808` | WebUI listen port |
| `AIONUI_REMOTE` | `1` | Pass `--remote` (LAN bind) |
| `AIONUI_DATA_DIR` | `~/.aionui-hermes` | Standalone WebUI data dir |
| `AIONUI_WEB_DIR` | `~/.local/share/aionui-web` | Install location for `aionui-web` |
| `AIONUI_WEB_VERSION` | `latest` | Pin installer version (e.g. `2.1.35`) |
| `AIONUI_WEB_FORCE` | `0` | Reinstall WebUI tarball when `1` |
| `OPEN_TUNNEL` | `1` | Cloudflare quick tunnel |

## Files

| Path | Role |
|------|------|
| [`scripts/start-aionui-hermes.sh`](../scripts/start-aionui-hermes.sh) | Install + start WebUI with Hermes on PATH |
| [`scripts/ensure-aionui-web.sh`](../scripts/ensure-aionui-web.sh) | Official `install-web.sh` wrapper |
| [`scripts/ensure-hermes-acp.sh`](../scripts/ensure-hermes-acp.sh) | `pip install -e hermes[acp]` + ACP check |
| [`scripts/bin/hermes`](../scripts/bin/hermes) | Python PATH shim → this repo’s Hermes |
| [`scripts/seed-aionui-hermes.sh`](../scripts/seed-aionui-hermes.sh) | Pin `command_override` + health-check |
| [`scripts/smoke_aionui_hermes.py`](../scripts/smoke_aionui_hermes.py) | Assert Hermes appears in assistants/management |

## Optional: develop against AionUi source

The ~900 MB upstream tree is **not** vendored. To hack on AionUi itself next to Hermes:

```bash
git clone --depth 1 https://github.com/iOfficeAI/AionUi.git aionui
# see aionui/docs/contributing/development.md (needs bun + aioncore)
```

`aionui/` is gitignored. Prefer the prebuilt `aionui-web` path above for preview.

## Marko one-hop (unchanged)

```bash
bash scripts/start-hermes-ui.sh
# → http://127.0.0.1:9119/
```

See [`docs/marko-ui-features/`](./marko-ui-features/README.md).

## Auth / models for Hermes

Hermes still needs its own provider credentials under `~/.hermes/` (or profile home):

```bash
cd hermes
PYTHONPATH=. python3 -m hermes_cli.main setup
# or: hermes setup
```

AionUi talking ACP to Hermes does not replace Hermes model/auth config.
