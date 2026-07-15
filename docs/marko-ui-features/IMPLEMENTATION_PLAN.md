# Marko ↔ Hermes One-Hop UI — Implementation Plan (Backend + Frontend)

Porting guide for re‑implementing the **Agent‑Marko / Hermes** chat UI stack on another system.

**This plan is the overview.** Detailed per-feature implementation guides live alongside it in this folder — start from [`README.md`](./README.md).

| Detailed guide | Feature |
|----------------|---------|
| [ONE_HOP_ARCHITECTURE.md](./ONE_HOP_ARCHITECTURE.md) | Same-origin SPA + API |
| [AUTH_AND_BOOT.md](./AUTH_AND_BOOT.md) | Token injection + headers |
| [AGUI_EVENTS.md](./AGUI_EVENTS.md) | SSE protocol + CUSTOM events |
| [SESSION_TITLES.md](./SESSION_TITLES.md) | Auto-title / summarization |
| [A2UI_FORMS.md](./A2UI_FORMS.md) | Interactive forms |
| [WORKING_DONE_EFFECTS.md](./WORKING_DONE_EFFECTS.md) | Working/done chrome |
| [CHAT_RELIABILITY.md](./CHAT_RELIABILITY.md) | runId guards, cancel, live |
| [FRONTEND_TOOLS.md](./FRONTEND_TOOLS.md) | Client-executed tools |
| [CAPABILITIES.md](./CAPABILITIES.md) | OpenAPI feature flags |
| [APP_SHELL.md](./APP_SHELL.md) | Shell, routes, shortcuts |
| [COMPOSER_AND_MARKDOWN.md](./COMPOSER_AND_MARKDOWN.md) | Composer + markdown |
| [PANELS.md](./PANELS.md) | All side panels |
| [API_MAPPING.md](./API_MAPPING.md) | Full route inventory |

---

## 0. Goals and non‑goals

### Goals

- Browser talks **same‑origin** to one backend (REST + SSE). No middle orchestration layer in production.
- Chat runs over **AG‑UI** (`POST /agui` → Server‑Sent Events).
- Interactive forms appear as **A2UI surfaces**, never as pasted HTML.
- Session list shows real titles (or preview / “New chat”), never stuck “Untitled”.
- Working/done UI is scoped to the active session and clears on history browse.

### Non‑goals

- Bun/Node BFF between browser and agent.
- Rendering raw HTML/CSS from assistant markdown as live forms.
- Requiring a separate Next.js server in production (static export is enough).

---

## 1. Target architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (static SPA — Next.js export or equivalent)        │
│    REST  /api/*                                             │
│    SSE   POST /agui  (Accept: text/event-stream)            │
└─────────────────────────────┬───────────────────────────────┘
                              │ same origin
┌─────────────────────────────▼───────────────────────────────┐
│  Backend (Hermes FastAPI reference — port 9119)             │
│    • Mount SPA from web_dist / static export                │
│    • Session DB + REST CRUD                                 │
│    • AG-UI endpoint → in-process agent loop                 │
│    • Tools: a2ui_render, frontend tools (ack-only)          │
└─────────────────────────────────────────────────────────────┘
```

| Concern | Backend | Frontend |
|--------|---------|----------|
| Host | Single process serves API + static UI | Same-origin fetches only (`/api/*`, `/agui`) |
| Chat | `POST /agui` SSE | AG-UI client (`HttpAgent` or compatible) |
| Auth | Session token or cookies | `X-Hermes-Session-Token` (or cookie session) |
| Build | Copy UI export → `web_dist` | `next build` with `output: 'export'` (or equivalent) |

**Dev-only optional proxy:** Next `:5173` can rewrite `/api/*` and `/agui` → backend `:9119`. Production must not depend on this.

**Platform gate:** During AG-UI runs, set `HERMES_PLATFORM=marko` (or your equivalent) so Marko-only tools register.

---

## 2. Feature inventory (what to port)

| # | Feature | Backend | Frontend |
|---|---------|---------|----------|
| F1 | One-hop SPA + API | Static mount, OpenAPI, capabilities | Build/copy export, same-origin client |
| F2 | AG-UI chat stream | `/agui` SSE + agent callbacks | Dispatcher → chat store |
| F3 | Session titles | Heuristic/LLM auto-title + `hermes.title` | `displaySessionTitle` + live update |
| F4 | Interactive forms | `a2ui_render` → `CUSTOM a2ui.message` | Surface processor + widget catalog |
| F5 | Multi-form one turn | `components[]` / `a2uiMessages[]` | Stack components on one surface |
| F6 | Form submit round-trip | Short-circuit `A2UI actionResponse` | `sendA2UIAction` REST + `/agui` |
| F7 | Working / done chrome | (optional) stage events | `runStatus` / `runStage` / `runSessionId` |
| F8 | History browse | `/api/sessions/:id/live` | Reset run UI on session switch |

---

## 3. Backend plan

### 3.1 Core HTTP surface

Implement at minimum:

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/` + static assets | SPA |
| `GET` | `/api/health` | Liveness |
| `GET` | `/api/capabilities` | Feature flags derived from live routes/tools |
| `GET` | `/api/sessions` | List (`order=recent`, include `title`, `preview`) |
| `POST` | `/api/sessions` | Create Marko session |
| `GET` | `/api/sessions/{id}/messages` | Hydrate chat (+ persisted `a2ui`) |
| `GET` | `/api/sessions/{id}/live` | `{ live, runId? }` for UI restore |
| `POST` | `/agui` | AG-UI SSE run |

Wire format for SSE: `data: {json}\n\n` per AG-UI event.

### 3.2 `POST /agui` agent loop

**Request (minimal):**

```json
{
  "threadId": "<session-uuid>",
  "runId": "<run-uuid>",
  "messages": [
    { "id": "1", "role": "user", "content": "Show a contact form on the UI" }
  ],
  "tools": [],
  "context": [],
  "state": null,
  "forwardedProps": { "profileId": "default" }
}
```

**Loop responsibilities:**

1. Emit `RUN_STARTED`.
2. Ensure session row exists (`source=marko` or equivalent).
3. Ensure an assistant message shell exists before tools (so A2UI can attach).
4. Stream thinking / text / tool events via callbacks.
5. On tool complete: if result contains A2UI envelope → emit `CUSTOM a2ui.message` (one per component).
6. After early replies: auto-title → emit `CUSTOM hermes.title`.
7. Optionally emit `CUSTOM hermes.context` (token usage).
8. Emit `RUN_FINISHED` (or `RUN_ERROR`).

**Marko ephemeral system prompt (required for forms):**

> You are running inside the Marko chat UI. When the user asks for a form, questionnaire, survey, contact form, intake, or interactive UI, call `a2ui_render` with `hermes:DynamicForm`. Never paste HTML/CSS/React source. If they ask for several form types / “all of them” / “in parallel”, call `a2ui_render` once with a `components` array of DynamicForms.

### 3.3 Standard AG-UI events to emit

| Event | Key fields |
|-------|------------|
| `RUN_STARTED` | `threadId`, `runId` |
| `RUN_FINISHED` | `threadId`, `runId` |
| `RUN_ERROR` | `threadId`, `runId`, `message`, `code` |
| `TEXT_MESSAGE_START` | `messageId`, `role: "assistant"` |
| `TEXT_MESSAGE_CONTENT` | `messageId`, `delta` |
| `TEXT_MESSAGE_END` | `messageId` |
| `THINKING_*` | thinking stream (optional but used by UI stages) |
| `TOOL_CALL_START` | `toolCallId`, `toolCallName`, `parentMessageId` |
| `TOOL_CALL_ARGS` | `toolCallId`, `delta` |
| `TOOL_CALL_END` | `toolCallId` |
| `TOOL_CALL_RESULT` | `toolCallId`, `content`, `role: "tool"` |

### 3.4 Custom events (Marko)

| `name` | `value` | Purpose |
|--------|---------|---------|
| `hermes.title` | `{ title, sessionId? }` | Sidebar/header title |
| `a2ui.message` | `{ surfaceId, component, complete?, data? }` | Interactive surface |
| `hermes.context` | `{ tokensUsed, tokensMax?, sessionId? }` | Token ring |
| `hermes.approval.required` | `{ toolCallId, toolName, args }` | Approval card (optional) |

Constants live in `packages/shared/src/agui-events.ts` in this repo.

### 3.5 Session titles (F3)

**Files (reference):** `hermes/agent/title_generator.py`, `hermes/hermes_cli/web_server.py` (`create_session_marko`), `hermes/hermes_cli/agui_endpoint.py`.

**Rules:**

1. Treat these as placeholders (do **not** persist as permanent titles):  
   `""`, `"new chat"`, `"untitled"`, `"untitled session"`, `"untitled chat"`.
2. On `POST /api/sessions` with placeholder title → store `NULL`, return display `"New chat"`.
3. After first user/assistant exchange (`user_count <= 2`):
   - Try LLM title generation.
   - On failure → `heuristic_title(user_message)` (≈ first 7 words, strip “please/can you…”, light title-case).
   - Persist title; emit `CUSTOM hermes.title` on the **same** SSE stream (wait briefly so the event rides the stream).

**Heuristic sketch:**

```text
normalize whitespace → drop chatty prefixes → take first N words →
clip to ~64 chars with ellipsis → capitalize first letter
```

### 3.6 A2UI render tool (F4 / F5)

**Tool name:** `a2ui_render`  
**Reference:** `hermes/tools/a2ui_render_tool.py`  
**Keep in core / always-visible tools** so tool-search cannot hide forms.

**Schema (port this):**

```json
{
  "name": "a2ui_render",
  "description": "Render interactive A2UI in chat. ALWAYS for forms. NEVER dump HTML. Multi-form → components[]. Prefer hermes:DynamicForm.",
  "parameters": {
    "type": "object",
    "properties": {
      "surfaceId": { "type": "string" },
      "message": { "type": "string" },
      "complete": { "type": "boolean", "default": true },
      "data": { "type": "object" },
      "component": {
        "type": "object",
        "required": ["type"],
        "properties": {
          "id": { "type": "string" },
          "type": { "type": "string" },
          "props": { "type": "object" },
          "children": { "type": "array", "items": { "type": "string" } }
        }
      },
      "components": { "type": "array", "items": { "type": "object" } }
    }
  }
}
```

**Tool result envelope:**

```json
{
  "content": "Interactive UI ready.",
  "a2ui": {
    "surfaceId": "a2ui-abc",
    "complete": true,
    "component": {
      "id": "contact-form",
      "type": "hermes:DynamicForm",
      "props": {
        "title": "Contact",
        "description": "We’ll get back shortly.",
        "fields": [
          { "name": "name", "label": "Full name", "type": "text", "required": true },
          { "name": "email", "label": "Email", "type": "email", "required": true },
          { "name": "message", "label": "Message", "type": "textarea", "required": true }
        ],
        "submitLabel": "Send"
      }
    }
  },
  "a2uiMessages": []
}
```

**Multi-form (one turn):**

- Input: `components: [DynamicForm, DynamicForm, …]` sharing one `surfaceId`.
- Output: first component in `a2ui`; remaining in `a2uiMessages[]` (same `surfaceId`).
- Extractor emits **one CUSTOM event per component**.
- Persist by consolidating components under one surface on the assistant message (`components[]`).

**Convenience:** If neither `component` nor `components` is set but `fields`/`title` are present → default to `hermes:DynamicForm`.

**Extractor reference:** `hermes/hermes_cli/agui_a2ui.py` (`extract_a2ui_messages`).

### 3.7 Persist A2UI on messages

- Column / field on messages: `a2ui` (JSON).
- After tool emits, update latest assistant message with consolidated payload.
- On `GET .../messages`, return `a2ui` so reload rehydrates surfaces.

### 3.8 A2UI actionResponse short-circuit (F6)

When request has:

- `state.a2uiAction = { surfaceId, action, data }`
- and last user text starts with `A2UI actionResponse`

→ **Do not** run a full agent turn. Emit a short ack + `RUN_FINISHED`.  
(Optional: still allow a full turn later if you want the model to narrate.)

### 3.9 Frontend tools (optional but useful)

Registered only when platform = Marko. Backend returns an ack; **client executes**:

| Tool | Args |
|------|------|
| `open_file_preview` | `{ path }` |
| `switch_panel` | `{ panel }` |
| `render_chart` | `{ data }` |
| `set_theme` | `{ theme: dark\|dim\|light }` |

Ack shape:

```json
{
  "content": "Frontend tool 'switch_panel' dispatched to Marko client.",
  "frontendTool": "switch_panel",
  "args": { "panel": "workspace" },
  "executedOnClient": true
}
```

### 3.10 Live run probe

`GET /api/sessions/{id}/live` → `{ "live": true|false, "runId": "..." }`  
Used when opening a session so the UI can restore working chrome only if a run is actually in flight.

---

## 4. Frontend plan

### 4.1 App shell

- Session sidebar + chat column + optional right panels.
- Session route: `/session/$id`.
- On `sessionId` change: **always** clear streaming + reset run UI first; restore only if live.

### 4.2 AG-UI client + dispatcher (F2)

**Reference:** `ui/src/lib/agui/client.ts`, `ui/src/lib/agui/dispatcher.ts`.

| Concern | Implementation notes |
|---------|----------------------|
| Transport | `POST /agui`, SSE parse, dispatch each event |
| Run identity | Client generates `runId` before request; ignore events where `event.runId !== active` |
| Session ownership | Track `runSessionId`; only show working/done UI when it matches viewed session |
| Stages | `starting` → `thinking` → `tool` → `writing` → `done`/`error` |
| Done fade | On `RUN_FINISHED`, show done briefly (~1.2s) then `clearStage()` |

### 4.3 Session titles (F3)

**Adapter:** `displaySessionTitle(row)` in `ui/src/lib/hermes-adapters.ts`.

```text
if title is non-placeholder → use title
else if preview → one-line clip ≤64
else → "New chat"
```

Never display `"Untitled"` for empty Marko sessions.

**Live:** on `CUSTOM hermes.title` → `updateSession(id, { title })`.

### 4.4 A2UI surface processor (F4 / F5)

**Reference:** `ui/src/lib/a2ui/processor.ts`.

In-memory map: `surfaceId → { components[], data, complete, sessionId }`.

On each `a2ui.message`:

1. Upsert surface.
2. Merge/replace components by `component.id` (stack multi-form on one surface).
3. `attachA2uiSurface(sessionId, surfaceId)` on the parent assistant message (idempotent).

**Hydration on reload:** `hydrateA2uiFromRef(message.a2ui)` must accept:

- surface id string, or
- full object with `component` / `components[]` / nested `a2uiMessages`.

**Render:** `MessageBubble` → `<A2UISurface surfaceId={…} />` → catalog.

### 4.5 Widget catalog (minimum port set)

| Type | Role |
|------|------|
| `hermes:DynamicForm` | Ready-to-fill form (contact, survey, intake) — **required** |
| `hermes:DocumentRequestForm` | Doc / PPT / PDF request |
| `hermes:FormRequestForm` | Meta “describe the form” intake |
| `hermes:CronSchedulePicker` | Schedule picker |
| `hermes:MemoryEntryEditor` | Memory edit |
| `hermes:SkillCard` | Skill card |
| `hermes:FileDiff` | Diff view |
| Standard | `Text`, `TextField`, `Select`, `Button`, `Checkbox`, `Card`, … |

**DynamicForm props:**

```ts
{
  title?: string
  description?: string
  fields?: Array<{
    name: string
    label?: string
    type?: 'text' | 'email' | 'textarea' | 'select' | 'checkbox' | 'number'
    required?: boolean
    placeholder?: string
    options?: Array<string | { value: string; label: string }>
  }> | string
  submitLabel?: string
}
```

**Submit action:** `submit_form` with `{ title, values, fields }`.

### 4.6 Form actions (F6)

**Reference:** `ui/src/lib/a2ui/actions.ts`.

For every widget action:

1. Optional REST side effect (`create_cron`, `create_document`, memory save, …).
2. Always `POST /agui` with:

```json
{
  "threadId": "<sessionId>",
  "runId": "<uuid>",
  "messages": [{
    "role": "user",
    "content": "A2UI actionResponse surface=… action=submit_form data={…}"
  }],
  "state": {
    "a2uiAction": { "surfaceId": "…", "action": "submit_form", "data": { } }
  }
}
```

### 4.7 Working / done UI (F7 / F8)

**State fields:**

| Field | Purpose |
|-------|---------|
| `runStatus` | `idle \| running \| error \| cancelled` |
| `runId` | Guard stale SSE |
| `runSessionId` | Which session owns chrome |
| `runStage` | Current stage + `startedAt` |
| `runSteps` | Optional step chips |

**Components:**

- `AgentWorkingBubble` — in-thread placeholder while running and no live assistant content yet.
- `StageStrip` (`RunProgress`) — footer status; gate with `runSessionId === viewedSessionId`.
- Message sparkle / shimmer only while `message.streaming`.

**Session switch algorithm (`ChatColumn`):**

```text
on sessionId change:
  clearStreamingState()
  resetRun()
  load messages (strip any leftover streaming flags)
  if GET /live → live:
    setRunStatus(running), setRunId, optional setStage
    start poll until not live → resetRun()
  else:
    resetRun() again
```

**Critical guards:**

- After `resetRun()`, `runId` is null → **reject** all run-scoped events (`isCurrentRun` false). Prevents sticky Done from a previous run’s late `RUN_FINISHED`.
- Do not show working bubble for session B while run belongs to session A.

### 4.8 Markdown / HTML gotcha

Assistant HTML in chat text must **not** become a live form. Use markdown without raw HTML execution (or strip HTML). Forms only via A2UI.

---

## 5. End-to-end flows

### 5.1 Single interactive form

```
User: "Put a contact form on the UI"
  → POST /agui
  → Agent calls a2ui_render({ component: hermes:DynamicForm … })
  → SSE: TOOL_CALL_* + CUSTOM a2ui.message
  → UI: attach surface → DynamicForm under assistant bubble
  → User submits → submit_form → toast + A2UI actionResponse ack
```

### 5.2 Multiple forms in one turn

```
User: "Do all of them in parallel" (web, survey, document intake, …)
  → a2ui_render({ components: [DynamicForm, DynamicForm, …] })
  → envelope a2ui + a2uiMessages[]
  → N × CUSTOM a2ui.message (same surfaceId)
  → A2UISurface stacks all components
  → Persist consolidated components[] on assistant message
```

### 5.3 Auto-title

```
First exchange completes
  → auto_title_session (LLM or heuristic)
  → CUSTOM hermes.title
  → Sidebar updates; DB title set
```

### 5.4 Open old session

```
Navigate /session/{id}
  → resetRun + clearStreaming
  → load messages (+ hydrate a2ui)
  → if not live → no working/done bubble
```

---

## 6. Implementation phases (recommended order)

### Phase A — Skeleton (both sides)

1. Backend serves static SPA + `/api/health` + `/api/sessions` CRUD.  
2. Frontend same-origin API client + session list/create.  
3. Smoke: create session, list shows “New chat”.

### Phase B — Chat SSE

1. Implement `/agui` with text streaming only.  
2. Frontend dispatcher + message list + composer.  
3. Smoke: round-trip chat.

### Phase C — Titles

1. Placeholder-aware create + heuristic/LLM auto-title + `hermes.title`.  
2. Frontend `displaySessionTitle` + CUSTOM handler.  
3. Smoke: first message → sidebar title updates (even without LLM keys).

### Phase D — A2UI forms

1. `a2ui_render` + extractor + CUSTOM emit + persist.  
2. Surface processor + `DynamicForm` + MessageBubble mount.  
3. Ephemeral Marko prompt.  
4. Smoke: “show a contact form on the UI” → interactive card, not HTML.

### Phase E — Multi-form + actions

1. `components[]` / `a2uiMessages` consolidation.  
2. Prompt for “all of them / parallel”.  
3. `sendA2UIAction` + actionResponse short-circuit.  
4. Smoke: three stacked forms; submit one.

### Phase F — Working chrome + history

1. Stages + working bubble + StageStrip.  
2. `runSessionId` gating + session-switch reset + `/live`.  
3. Smoke: open old session → no sticky working/done UI.

### Phase G — Polish

1. Frontend tools (panel/theme/preview).  
2. Capabilities endpoint.  
3. API mapping doc + validator (see [`API_MAPPING.md`](./API_MAPPING.md)).

---

## 7. Acceptance checklist

- [ ] Production UI loads from backend origin (no required proxy).  
- [ ] `POST /agui` streams AG-UI events including CUSTOM.  
- [ ] Empty sessions show **New chat**, never **Untitled**.  
- [ ] First chat gets a title via LLM or heuristic; `hermes.title` updates sidebar.  
- [ ] “Form on UI” → `a2ui_render` → interactive `DynamicForm` (not HTML dump).  
- [ ] “All of them / parallel” → multiple DynamicForms stacked in one turn.  
- [ ] Form submit shows toast and posts actionResponse.  
- [ ] Reload session restores A2UI surfaces from persisted `a2ui`.  
- [ ] Working bubble only while that session’s run is active.  
- [ ] Opening history clears working/done chrome unless `/live` is true.  
- [ ] Abort/superseded runs do not leave sticky Done UI.

---

## 8. Reference file map (this repo)

### Backend

| Path | Role |
|------|------|
| `hermes/hermes_cli/web_server.py` | FastAPI, SPA, sessions API |
| `hermes/hermes_cli/agui_endpoint.py` | `/agui` SSE, title, A2UI, Marko prompt |
| `hermes/hermes_cli/agui_a2ui.py` | A2UI envelope extraction |
| `hermes/hermes_cli/marko_session.py` | Marko session ensure/DTO |
| `hermes/hermes_cli/marko_capabilities.py` | Capabilities flags |
| `hermes/agent/title_generator.py` | Placeholders, heuristic, auto-title |
| `hermes/tools/a2ui_render_tool.py` | `a2ui_render` + frontend tools |
| `hermes/toolsets.py` | `marko` toolset + core pin for `a2ui_render` |

### Frontend

| Path | Role |
|------|------|
| `ui/src/lib/agui/client.ts` | Run agent, load messages, live poll |
| `ui/src/lib/agui/dispatcher.ts` | Event → store |
| `ui/src/lib/hermes-adapters.ts` | REST DTOs, `displaySessionTitle` |
| `ui/src/stores/chat.ts` | Messages, run state, A2UI attach |
| `ui/src/lib/a2ui/processor.ts` | Surface map / hydrate |
| `ui/src/lib/a2ui/actions.ts` | Form actions |
| `ui/src/components/a2ui/catalog/index.tsx` | Widget registry |
| `ui/src/components/a2ui/hermes-widgets/DynamicForm.tsx` | Fillable form |
| `ui/src/components/chat/AgentWorkingBubble.tsx` | Working placeholder |
| `ui/src/components/chat/RunProgress.tsx` | Stage strip |
| `ui/src/components/shell/ChatColumn.tsx` | Session switch reset |
| `packages/shared/src/agui-events.ts` | Custom event names |
| `packages/shared/src/a2ui-catalog.ts` | Widget prop types |

### Tests to mirror

| Path | Covers |
|------|--------|
| `hermes/tests/hermes_cli/test_agui_a2ui.py` | Multi-form extraction |
| `hermes/tests/hermes_cli/test_agui_endpoint.py` | SSE / A2UI wiring |
| `ui/test/hermes-adapters.test.ts` | Title display rules |
| `ui/test/a2ui-processor.test.ts` | Surface stacking / hydrate |
| `ui/test/session-history-run-ui.test.ts` | History run UI guards |
| `ui/test/dispatcher-phase4.test.ts` | CUSTOM events |

### Local preview (this repo)

```bash
bash scripts/start-hermes-ui.sh
# → http://127.0.0.1:9119/
```

---

## 9. Minimal port (smallest viable product)

If another system only needs the essentials:

1. `/agui` text stream + `a2ui_render` → `a2ui.message`.  
2. One widget: `hermes:DynamicForm`.  
3. Title heuristic + list adapter.  
4. Session-switch `resetRun()`.  

Defer: frontend tools, cron/doc widgets, approvals, token ring, multi-profile.

---

## 10. Design rules that must not be lost in a port

1. **Forms are tools, not markdown.** HTML in chat ≠ UI.  
2. **Placeholders are empty.** Never persist “New chat” as a final title.  
3. **One surface, many components** for parallel forms.  
4. **Run UI is session-scoped.** History must not inherit another chat’s working/done state.  
5. **Same-origin one-hop.** Production browser → one backend; no required BFF.

---

*Generated for porting Marko/Hermes one-hop UI features. Keep this file in sync when adding new CUSTOM events or catalog widgets.*
