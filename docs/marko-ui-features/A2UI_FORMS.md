# A2UI Interactive Forms — Detailed Implementation

## Problem

Users ask for a “form on the UI” and historically received **HTML source in chat**. Marko markdown must **not** execute HTML. Interactive forms are **A2UI surfaces** only.

## Pipeline (implement exactly)

```
1. Ephemeral Marko system prompt forbids HTML forms; requires a2ui_render
2. Model calls a2ui_render({ component | components })
3. Tool returns JSON:
     { content, a2ui: { surfaceId, component, complete }, a2uiMessages?: [...] }
4. on_tool_complete → extract_a2ui_messages(result)
5. For each payload: emit CUSTOM a2ui.message (+ parentMessageId)
6. Dispatcher: processA2UIMessage + attachA2uiSurface(sessionId, surfaceId, parentMessageId?)
7. MessageBubble: if message.a2ui → <A2UISurface />
8. Catalog renders hermes:DynamicForm (or other widgets)
9. User submit → sendA2UIAction → REST + POST /agui actionResponse
10. Persist consolidated a2ui JSON on assistant message for reload
```

## Backend

### 1. Tool schema

**File:** `hermes/tools/a2ui_render_tool.py`

- Name: `a2ui_render`
- Pin in `_HERMES_CORE_TOOLS` (`toolsets.py`) so tool-search cannot hide it
- Description must say: ALWAYS for forms; NEVER dump HTML; multi-form → `components[]`
- Convenience: if no component but `fields`/`title` present → default `hermes:DynamicForm`

### 2. Envelope builder

```python
{
  "content": "Interactive UI ready.",
  "a2ui": {
    "surfaceId": "a2ui-…",
    "complete": True,
    "component": { "id": "…", "type": "hermes:DynamicForm", "props": {…} }
  },
  # when components[1:]:
  "a2uiMessages": [ { surfaceId, component, complete }, … ]
}
```

### 3. Extractor

**File:** `hermes/hermes_cli/agui_a2ui.py` — `extract_a2ui_messages`

Must expand:

- nested `{ a2ui: {…} }`
- `a2uiMessages[]`
- top-level `components[]` into one message per component

### 4. SSE emit + parentMessageId

**File:** `agui_endpoint.py` `on_tool_complete`

```python
for a2ui_payload in extract_a2ui_messages(result):
    a2ui_payload = { **a2ui_payload, "parentMessageId": message_id }
    emit({ "type": "CUSTOM", "name": "a2ui.message", "value": a2ui_payload })
```

Ensure assistant `TEXT_MESSAGE_START` / shell exists before tools so UI has a bubble to attach to.

### 5. Persist

Consolidate by `surfaceId` (upsert components by `id`) → `UPDATE messages SET a2ui=?`.

### 6. actionResponse short-circuit

If user text starts with `A2UI actionResponse` and `state.a2uiAction` set → ack + `RUN_FINISHED` (optional full turn later).

### 7. Ephemeral prompt (required)

Instruct model:

- Forms → `a2ui_render` + `hermes:DynamicForm`
- “all of them / parallel” → one call with `components[]`
- Never paste HTML/CSS/React form source

## Frontend

### 1. Surface processor

**File:** `ui/src/lib/a2ui/processor.ts`

```ts
Map<surfaceId, { components[], data, complete, sessionId }>
processA2UIMessage(value, sessionId)  // merge/replace by component.id
hydrateA2uiFromRef(ref, sessionId)    // string id OR full JSON with components[]
```

### 2. Attach to message

**File:** `ui/src/stores/chat.ts` — `attachA2uiSurface`

```
1. Prefer explicit messageId / parentMessageId
2. Else latest a2ui_render toolCall.messageId
3. Else latest assistant message
4. If none: CREATE assistant placeholder, then bind
5. Set message.a2ui = surfaceId (idempotent if same id)
```

### 3. Render

**Files:** `MessageBubble.tsx`, `A2UISurface.tsx`, `catalog/index.tsx`

`A2UISurface` must subscribe to **component count/ids**, not only `complete` (multi-form updates).

### 4. DynamicForm widget

**File:** `ui/src/components/a2ui/hermes-widgets/DynamicForm.tsx`

Props:

```ts
{
  title?: string
  description?: string
  fields?: Array<{
    name: string
    label?: string
    type?: 'text'|'email'|'textarea'|'select'|'checkbox'|'number'
    required?: boolean
    placeholder?: string
    options?: Array<string | { value: string; label: string }>
  }> | string  // also accept newline/comma list
  submitLabel?: string
}
```

On submit → `onAction('submit_form', { title, values, fields })`.

### 5. Actions

**File:** `ui/src/lib/a2ui/actions.ts`

| Action | Side effect |
|--------|-------------|
| `submit_form` | Toast; AG-UI ack |
| `create_cron` | `POST /api/cron` |
| `create_document` | workspace write / cowork task |
| `save` / `delete` | memory entries |
| `use_skill` | toast / skill dispatch |
| `specify_form` | meta form follow-up |

Always also `POST /agui` with:

```json
{
  "messages": [{ "role": "user", "content": "A2UI actionResponse surface=… action=… data=…" }],
  "state": { "a2uiAction": { "surfaceId", "action", "data" } }
}
```

### 6. Catalog widgets to port

| Type | Priority |
|------|----------|
| `hermes:DynamicForm` | **Required** |
| `hermes:DocumentRequestForm` | High |
| `hermes:CronSchedulePicker` | High |
| `hermes:FormRequestForm` | Medium |
| `hermes:MemoryEntryEditor` | Medium |
| `hermes:SkillCard` | Medium |
| `hermes:FileDiff` | Low |
| Standard Text/TextField/Select/Button/Card | Medium |

Shared types: `packages/shared/src/a2ui-catalog.ts`.

## Multi-form one turn

Agent call:

```json
{ "components": [ DynamicForm, DynamicForm, DynamicForm ] }
```

Same `surfaceId`; UI stacks all components vertically in one artifact card.

## Tests

| Test | Path |
|------|------|
| Extract multi | `hermes/tests/hermes_cli/test_agui_a2ui.py` |
| Smoke envelope | `hermes/tests/hermes_cli/test_a2ui_smoke.py` |
| Attach missing bubble | `ui/test/dispatcher-phase4.test.ts` |
| Hydrate stack | `ui/test/a2ui-processor.test.ts` |

## Porting checklist

- [ ] `a2ui_render` always visible on Marko runs
- [ ] Ephemeral prompt forbids HTML forms
- [ ] CUSTOM emit includes `parentMessageId`
- [ ] attach creates assistant bubble if needed
- [ ] DynamicForm renders + submit_form works
- [ ] Multi-form stacks on one surface
- [ ] Persist + hydrate on reload
- [ ] Markdown has no rehype-raw HTML execution

## Acceptance

- [ ] “Show a contact form on the UI” → interactive card.
- [ ] “Do all of them in parallel” → multiple forms in one reply.
- [ ] HTML pasted as text is not clickable as a form.
- [ ] Reload keeps the form.
