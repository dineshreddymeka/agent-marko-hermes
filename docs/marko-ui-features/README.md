# Marko UI Features

Documentation for the **Agent-Marko ↔ Hermes one-hop** UI features (branch `cursor/nextjs-ui-e2f3`).

Use this folder when porting the stack to another system or onboarding to the new chat/forms/title/working-chrome work.

## Contents

| Doc | What it covers |
|-----|----------------|
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Full backend + frontend porting plan (architecture, phases, checklist, file map) |
| [API_MAPPING.md](./API_MAPPING.md) | Complete REST + AG-UI route map, aliases, OpenAPI validation |
| [AGUI_EVENTS.md](./AGUI_EVENTS.md) | AG-UI SSE + Marko `CUSTOM` events and payload shapes |
| [SESSION_TITLES.md](./SESSION_TITLES.md) | Auto-title / summarization (heuristic + `hermes.title`) |
| [A2UI_FORMS.md](./A2UI_FORMS.md) | Interactive forms via `a2ui_render` / `hermes:DynamicForm` |
| [WORKING_DONE_EFFECTS.md](./WORKING_DONE_EFFECTS.md) | Cursor-like working/done chrome and history clear |

## Quick start (this repo)

```bash
bash scripts/start-hermes-ui.sh
# → http://127.0.0.1:9119/
npm run validate:api-map   # checks API_MAPPING.md vs UI callers + OpenAPI
```

## Architecture (one line)

Browser (Next static export) → same-origin Hermes FastAPI (`/api/*` + `POST /agui` SSE). No Bun middle layer in production.
