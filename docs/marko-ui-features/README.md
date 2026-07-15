# Marko UI Features — Documentation Index

All **Agent-Marko ↔ Hermes one-hop** feature docs live in this folder. Use them to implement or port the stack on another system.

## How to use

1. Start with [ONE_HOP_ARCHITECTURE.md](./ONE_HOP_ARCHITECTURE.md) and [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).
2. Wire transport + auth: [AGUI_EVENTS.md](./AGUI_EVENTS.md), [AUTH_AND_BOOT.md](./AUTH_AND_BOOT.md).
3. Ship chat polish: [SESSION_TITLES.md](./SESSION_TITLES.md), [WORKING_DONE_EFFECTS.md](./WORKING_DONE_EFFECTS.md), [CHAT_RELIABILITY.md](./CHAT_RELIABILITY.md).
4. Ship interactive UI: [A2UI_FORMS.md](./A2UI_FORMS.md), [FRONTEND_TOOLS.md](./FRONTEND_TOOLS.md).
5. Ship shell + panels: [APP_SHELL.md](./APP_SHELL.md), [COMPOSER_AND_MARKDOWN.md](./COMPOSER_AND_MARKDOWN.md), [CAPABILITIES.md](./CAPABILITIES.md), [PANELS.md](./PANELS.md).
6. Keep routes honest: [API_MAPPING.md](./API_MAPPING.md) + `npm run validate:api-map`.

## Document map

| Doc | Scope |
|-----|--------|
| [ONE_HOP_ARCHITECTURE.md](./ONE_HOP_ARCHITECTURE.md) | Browser → Hermes only; build/export; ports; no Bun BFF |
| [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) | Phased port plan (backend + frontend) + acceptance |
| [API_MAPPING.md](./API_MAPPING.md) | Full REST + AG-UI inventory, aliases, missing routes |
| [AUTH_AND_BOOT.md](./AUTH_AND_BOOT.md) | Token injection, headers, boot, login gate |
| [AGUI_EVENTS.md](./AGUI_EVENTS.md) | SSE protocol, standard + CUSTOM events, payloads |
| [SESSION_TITLES.md](./SESSION_TITLES.md) | Auto-title / summarization end-to-end |
| [A2UI_FORMS.md](./A2UI_FORMS.md) | `a2ui_render`, DynamicForm, multi-form, actions |
| [WORKING_DONE_EFFECTS.md](./WORKING_DONE_EFFECTS.md) | Cursor-like working/done chrome + history clear |
| [CHAT_RELIABILITY.md](./CHAT_RELIABILITY.md) | runId guards, cancel, watchdog, live poll |
| [FRONTEND_TOOLS.md](./FRONTEND_TOOLS.md) | Client-executed Marko tools |
| [CAPABILITIES.md](./CAPABILITIES.md) | OpenAPI-driven feature flags + IconRail gates |
| [APP_SHELL.md](./APP_SHELL.md) | Layout, routing, shortcuts, theme, toasts |
| [COMPOSER_AND_MARKDOWN.md](./COMPOSER_AND_MARKDOWN.md) | Composer, slash commands, streaming markdown |
| [PANELS.md](./PANELS.md) | Workspace, Skills, Memory, MCP, Cron, Kanban, Profiles, Settings |

## Local preview (this repo)

```bash
bash scripts/start-hermes-ui.sh
# → http://127.0.0.1:9119/
npm run validate:api-map
```

## Contract sources

| Source | Path / URL |
|--------|------------|
| Shared events | `packages/shared/src/agui-events.ts` |
| A2UI catalog types | `packages/shared/src/a2ui-catalog.ts` |
| REST DTOs | `packages/shared/src/api-types.ts` |
| Live OpenAPI | `http://127.0.0.1:9119/openapi.json` |
| Capabilities | `GET /api/capabilities` |
