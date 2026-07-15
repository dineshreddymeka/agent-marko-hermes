# Panels — Detailed Implementation

## Goal

Each IconRail destination is a focused panel backed by Hermes REST (or explicitly descoped). Panels render full-bleed on `/panel/$name` and may also appear in the right column.

## Panel registry

| Panel id | Component | Primary APIs | Backend bridge |
|----------|-----------|--------------|----------------|
| `sessions` | `SessionsPanel.tsx` | `/api/sessions*`, `/api/search` | SessionDB |
| `workspace` | `WorkspacePanel.tsx` | `/api/fs/*`, `/api/git/status` | FS + git |
| `skills` | `SkillsPanel.tsx` | `/api/skills*` | Skills registry |
| `memory` | `MemoryPanel.tsx` | `/api/memory/*` | `marko_memory_api.py` |
| `connections` | `ConnectionsPanel.tsx` | `/api/mcp/servers*` | MCP SQLite registry |
| `cron` | `CronPanel.tsx` | `/api/cron/jobs*` | Cron store (+ aliases) |
| `kanban` | `KanbanPanel.tsx` | `/api/kanban*` | `marko_kanban.py` |
| `profiles` | `ProfilesPanel.tsx` | `/api/profiles*` (`?marko=1`) | `marko_profiles_api.py` |
| `settings` | `SettingsPanel.tsx` | `/api/config*`, `/api/env`, `/api/model/*` | Config |
| `office` / `briefing` | `DescopedPanel` / stubs | `/api/office/*` **often missing** | — |

Route: `ui/src/routes/panel.$name.tsx`.

## Common patterns

1. **React Query** keys per panel (`['sessions']`, `['mcp-servers']`, …).
2. **Adapters** in `hermes-adapters.ts` or `panels/*-api.ts` map Hermes snake_case → Marko camelCase DTOs from `@hermes/shared`.
3. **Optimistic mutations** with toast on error + invalidate.
4. **Capabilities gate** — hide if `features[id] === false` ([CAPABILITIES.md](./CAPABILITIES.md)).
5. **Descoped** — if Hermes has no API, show `DescopedPanel` with `descopedFeatureMessage()`.

---

## Sessions panel

**Implement:**

- List via `fetchHermesSessions` → `displaySessionTitle` ([SESSION_TITLES.md](./SESSION_TITLES.md)).
- `setSessions(mergeSessionsPreservingTitles(local, api))` — never clobber live titles.
- Group: pinned / custom / Today / Yesterday / This week / Older / Archived (`groupSessions` in `panels.ts`).
- Search: local filter + `GET /api/search` merge (`mergeSessionSearch`).
- Actions: create, rename (PATCH), pin, archive, delete.
- Compact mode for sidebar; full mode for `/panel/sessions`.

**Files:** `SessionsPanel.tsx`, `session-title.ts`, `hermes-adapters.ts`, `panels.ts`

---

## Workspace panel

**Implement master–detail:**

- Left: directory tree (`GET /api/fs/list` or equivalent).
- Right: file preview/editor (`GET` content, `PUT`/`POST` save).
- Git status strip (`GET /api/git/status`).
- Image preview for binary images.
- Upload entry points; respect `ui.workspacePreviewPath` from `open_file_preview` tool.
- File-kind colors via `fileColorFromPath` (`panels.ts`) + tokens.

**Files:** `WorkspacePanel.tsx`, `workspace-api.ts`, `panels.ts`

---

## Skills panel

**Implement:**

- List skills with enable/disable.
- Create / edit / delete user skills.
- Hub: search, preview, install, sync, uninstall (`/api/skills/hub/*`).
- Show source badges (builtin, user-folder, learned, git).

**Files:** `SkillsPanel.tsx`, `hermes-skills.ts`, `panels/skills-helpers.ts`

---

## Memory panel

**Implement:**

- List entries (semantic / episodic / preference).
- Create / patch / delete.
- Filter by kind; sort by importance.
- Search if API supports.
- Bridge file-backed MEMORY.md/USER.md via `marko_memory_api.py`.

**Files:** `MemoryPanel.tsx`, `marko_memory_api.py`

Also used by A2UI `MemoryEntryEditor` actions (`save` / `delete`).

---

## Connections (MCP) panel

**Implement:**

- CRUD MCP servers (`/api/mcp/servers`).
- Enable/disable; test connection; show tools/resources.
- Tool allowlist toggles (`hermesMcpNextToolWhitelist`).
- Events/log stream if available.
- Capabilities warm button.

**Files:** `ConnectionsPanel.tsx`, `McpSubPanel.tsx`, `hermes-adapters.ts` MCP helpers

---

## Cron / Cowork panel

**Implement tabs:**

1. **Jobs** — list/create/edit/delete cron jobs; enable toggles; run history.
2. **Wizard** — schedule picker, MCP/skill bindings, preview (`POST /api/cron/wizard/preview` or client `previewCronSchedule`).
3. **Cowork work requests** — if `/api/cowork/*` missing, show descoped empty state.

Aliases: `POST /api/cron` may map to jobs create for A2UI `create_cron`.

**Files:** `CronPanel.tsx`, `panels/cron-*.ts`, `CoworkWorkRequests.tsx`, A2UI `CronSchedulePicker.tsx`

---

## Kanban panel

**Implement:**

- Columns by status; drag or buttons to move.
- Create / comment / complete / block tasks.
- DTO bridge: `marko_kanban.py` → shared kanban types.

**Files:** `KanbanPanel.tsx`, `marko_kanban.py`

---

## Profiles panel

**Implement:**

- List profiles; create/update/delete.
- Set default profile.
- Marko DTO via `GET/POST/PATCH /api/profiles?marko=1` (`marko_profiles_api.py`).
- Selected `profileId` forwarded on `/agui` as `forwardedProps.profileId`.

**Files:** `ProfilesPanel.tsx`, `marko_profiles_api.py`, `hermes-adapters.ts`

---

## Settings panel

**Implement sections:**

- Hermes config / env / model editors.
- Approval policy config (if routes exist).
- Embedded MCP shortcuts + **Debug replay** tab (`DebugReplayPanel` + `agui/replay.ts`) when `/api/debug/*` exists; otherwise descoped note.

**Files:** `SettingsPanel.tsx`, `panels/settings-hermes.ts`, `DebugReplayPanel.tsx`

---

## Descoped / Office / Briefing

When OpenAPI lacks `/api/office/*` (or similar):

- Route panel id → `DescopedPanel`.
- Copy via `descopedFeatureMessage(feature)`.

Do not fake APIs.

---

## Implementation order (recommended)

1. Sessions (needed for chat).
2. Workspace + frontend `open_file_preview`.
3. Settings/health model display.
4. Skills, Memory, MCP.
5. Cron wizard + A2UI cron picker.
6. Kanban, Profiles.
7. Descoped placeholders for missing families.

## Acceptance (per panel)

- [ ] Loads without crashing when API healthy.
- [ ] Empty and error states are explicit.
- [ ] Mutations toast + invalidate queries.
- [ ] Hidden or descoped when capabilities/OpenAPI say unavailable.
- [ ] Paths appear in [API_MAPPING.md](./API_MAPPING.md) inventory.

## Reference index

| Panel | Frontend | Backend |
|-------|----------|---------|
| Sessions | `SessionsPanel.tsx` | `web_server.py` sessions |
| Workspace | `WorkspacePanel.tsx` | FS + git routes |
| Skills | `SkillsPanel.tsx` | skills routes |
| Memory | `MemoryPanel.tsx` | `marko_memory_api.py` |
| MCP | `ConnectionsPanel.tsx` | mcp servers |
| Cron | `CronPanel.tsx` | cron jobs + aliases |
| Kanban | `KanbanPanel.tsx` | `marko_kanban.py` |
| Profiles | `ProfilesPanel.tsx` | `marko_profiles_api.py` |
| Settings | `SettingsPanel.tsx` | config/env/model |
| Capabilities | — | `marko_capabilities.py` |
