# assistant-ui + Hermes (AG-UI)

Open-source [assistant-ui](https://github.com/assistant-ui/assistant-ui) chat UI
wired to this repo’s Hermes Agent via **AG-UI** (`POST /agui`).

```text
Browser → assistant-ui (Next :3000)
              │  rewrite /agui + /api/* 
              ▼
         Hermes FastAPI (:9119)
```

MIT / free self-host. Uses `@assistant-ui/react-ag-ui` + `@ag-ui/client`.
Not CopilotKit Cloud. Not AWS Strands–only.

## Prerequisites

1. Hermes running on `:9119` (loopback auth / session token):

```bash
# from monorepo root
bash scripts/start-hermes-ui.sh --skip-build
# or: cd hermes && PYTHONPATH=. python3 -m hermes_cli.main dashboard --host 127.0.0.1 --port 9119 --no-open --skip-build
```

2. A model/provider configured under `~/.hermes` so chat can complete.

## Run

```bash
# from monorepo root
bash scripts/start-assistant-ui-hermes.sh
# → http://127.0.0.1:3000/
```

Or manually:

```bash
cd apps/assistant-ui
cp .env.example .env.local   # optional
npm install
npm run dev -- --port 3000
```

## What this uses

| Piece | Role |
|-------|------|
| `POST /agui` | AG-UI SSE chat (Hermes `agui_endpoint.py`) |
| `GET /api/marko/boot` | Loopback session token → `X-Hermes-Session-Token` |
| assistant-ui Thread / GenUI tools | Chat UX + optional client tools |

## What this does **not** use

- CopilotKit Cloud (paid)
- Hermes WebUI (`:8787`) protocol
- Google A2UI catalog out of the box (assistant-ui has its own GenUI/tool UI; Hermes A2UI CUSTOM events are Marko-oriented)

## Sample echo agent

`server/agent.py` is the upstream assistant-ui demo backend. This integration
defaults to **Hermes**, not that echo server. Keep it only for local protocol
experiments.
