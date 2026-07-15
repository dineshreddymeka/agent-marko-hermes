# Capabilities — Detailed Implementation

## Goal

Marko discovers which Hermes features exist from a live **`GET /api/capabilities`** manifest (derived from OpenAPI), then gates panels and slash commands without hard-coding backend version matrices.

## Backend

### Endpoint

**File:** `hermes/hermes_cli/marko_capabilities.py`

```
GET /api/capabilities
→ {
  features: { workspace: true, skills: true, memory: true, … },
  skills: […],
  plugins: […],
  slashCommands: […],
  agentLlm: { mode, mock, model }
}
```

### Feature map construction

For each feature key, test whether OpenAPI paths include a required prefix:

| Feature key | Path prefix examples |
|-------------|----------------------|
| `workspace` | `/api/fs` |
| `skills` | `/api/skills` |
| `memory` | `/api/memory` |
| `mcp` / `connections` | `/api/mcp` |
| `cron` | `/api/cron` |
| `kanban` | `/api/kanban` |
| `profiles` | `/api/profiles` |
| `agui` | `/agui` |
| `a2ui` | available when AG-UI mounted |

### Warm

`POST /api/capabilities/warm` — optional reconnect/probe for Connections panel.

## Frontend

### Fetch + cache

**Files:** `ui/src/lib/useCapabilities.ts`, `ui/src/components/CapabilitiesBootstrap.tsx`

- Prefetch on app boot.
- Fail-open: if capabilities missing, show panels (don’t lock users out of a broken probe).

### IconRail gating

**File:** `ui/src/components/shell/IconRail.tsx`

```ts
isHermesFeatureEnabled(featureKey, capabilities)
// hide rail item when features[key] === false
```

### Slash command sync

Merge `capabilities.slashCommands` (including `mcp:*`) into composer slash registry (`slash-commands.ts`).

### Agent LLM degraded

`isAgentLlmDegraded(capabilities)` — UI can warn when tool routing is limited.

## Implementation steps

1. Parse OpenAPI paths in process (or cache from `/openapi.json`).
2. Build boolean `features` map + optional lists.
3. Expose `GET /api/capabilities`.
4. Frontend bootstrap query; store in React Query.
5. Gate IconRail + panel routes.
6. Sync slash commands from manifest.
7. Document flags ↔ panels in [API_MAPPING.md](./API_MAPPING.md).

## Acceptance

- [ ] Removing a Hermes route family flips the related feature flag false.
- [ ] IconRail hides unavailable panels when flags are present.
- [ ] Fail-open if capabilities request fails.
- [ ] `npm run validate:api-map` still passes.

## Reference files

| Layer | Path |
|-------|------|
| API | `hermes/hermes_cli/marko_capabilities.py` |
| Hook | `ui/src/lib/useCapabilities.ts` |
| Bootstrap | `ui/src/components/CapabilitiesBootstrap.tsx` |
| Rail | `ui/src/components/shell/IconRail.tsx` |
| Slash | `ui/src/lib/slash-commands.ts` |
