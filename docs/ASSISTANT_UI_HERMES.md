# assistant-ui + Hermes (AG-UI)

Free MIT chat UI from [assistant-ui](https://github.com/assistant-ui/assistant-ui) (~11k★)
connected to this repo’s Hermes Agent over **AG-UI**.

## Why this

Closest open peer to CopilotKit’s React chat + GenUI layer, without CopilotKit Cloud.
Uses `@assistant-ui/react-ag-ui` — works with **any** AG-UI backend (Hermes `/agui`, not AWS Strands–only).

```text
Browser → apps/assistant-ui (Next :3000)
              │  /agui + /api/* rewrites
              ▼
         hermes/ FastAPI (:9119)
              │
              ▼
         AIAgent / tools / sessions
```

## Quick start

```bash
bash scripts/start-assistant-ui-hermes.sh
# → http://127.0.0.1:3000/
```

Requires Node 22+ and a Hermes process on `:9119` (the script starts one if needed).

App details: [`apps/assistant-ui/README.md`](../apps/assistant-ui/README.md)

## Protocol notes

| Protocol | Status in this path |
|----------|---------------------|
| AG-UI (`POST /agui`) | **Yes** — primary chat transport |
| assistant-ui GenUI / client tools | **Yes** — toolkit in `app/page.tsx` |
| Hermes A2UI `CUSTOM a2ui.message` | Marko-oriented; not fully rendered here yet |
| OpenAI `/v1` (`:8642`) | Not used |
| CopilotKit Cloud | Not used |

## Smoke checks

```bash
curl -sS http://127.0.0.1:9119/api/health
curl -sS http://127.0.0.1:9119/api/marko/boot   # loopback token
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/
```
