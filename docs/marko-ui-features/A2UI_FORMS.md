# A2UI Interactive Forms

Marko does **not** execute HTML from chat markdown. Forms must come from **`a2ui_render` → `CUSTOM a2ui.message`**.

## Pipeline

```
User asks for a form on the UI
  → Agent calls a2ui_render ({ component | components })
  → Tool JSON envelope { content, a2ui, a2uiMessages? }
  → on_tool_complete → extract_a2ui_messages
  → SSE CUSTOM a2ui.message (one per component; parentMessageId set)
  → dispatcher: processA2UIMessage + attachA2uiSurface
  → MessageBubble → A2UISurface → catalog (hermes:DynamicForm, …)
  → User submit → sendA2UIAction (REST + POST /agui actionResponse)
  → Persist consolidated a2ui JSON on assistant message
```

## Tool: `a2ui_render`

- File: `hermes/tools/a2ui_render_tool.py`
- Toolset: `marko` (+ pinned in core tools so tool-search cannot hide it)
- Platform: `HERMES_PLATFORM=marko` during AG-UI runs
- Ephemeral Marko prompt: never dump HTML; multi-form → `components[]`

### Single form

```json
{
  "component": {
    "type": "hermes:DynamicForm",
    "props": {
      "title": "Contact",
      "description": "We’ll get back shortly.",
      "fields": [
        { "name": "name", "label": "Name", "type": "text", "required": true },
        { "name": "email", "label": "Email", "type": "email", "required": true },
        { "name": "message", "label": "Message", "type": "textarea", "required": true }
      ],
      "submitLabel": "Send"
    }
  }
}
```

### Multiple forms in one turn

```json
{
  "components": [
    { "id": "web", "type": "hermes:DynamicForm", "props": { "title": "Web form", "fields": ["…"] } },
    { "id": "survey", "type": "hermes:DynamicForm", "props": { "title": "Survey", "fields": ["…"] } },
    { "id": "intake", "type": "hermes:DynamicForm", "props": { "title": "App intake", "fields": ["…"] } }
  ]
}
```

Envelope: first component in `a2ui`, extras in `a2uiMessages[]`, **same `surfaceId`**. UI stacks all on one surface.

## Catalog widgets

| Type | Role |
|------|------|
| `hermes:DynamicForm` | Ready-to-fill form (required for “form on UI”) |
| `hermes:DocumentRequestForm` | Doc / PPT / PDF request |
| `hermes:FormRequestForm` | Meta “describe the form” intake |
| `hermes:CronSchedulePicker` | Cron schedule |
| `hermes:MemoryEntryEditor` | Memory edit |
| `hermes:SkillCard` | Skill card |
| `hermes:FileDiff` | Diff view |

Shared types: `packages/shared/src/a2ui-catalog.ts`  
Render: `ui/src/components/a2ui/catalog/index.tsx`  
Widget: `ui/src/components/a2ui/hermes-widgets/DynamicForm.tsx`

## Attachment rules (critical)

1. Ensure an assistant message exists before/when tools run (`parentMessageId`).
2. `attachA2uiSurface` must create a missing assistant bubble if needed.
3. `A2UISurface` must re-render when component count/ids change (not only `complete`).
4. Hydrate from persisted `message.a2ui` on session reload.

## Actions

`ui/src/lib/a2ui/actions.ts`:

- Known actions hit REST (`create_cron`, `create_document`, memory, …).
- Always also `POST /agui` with `state.a2uiAction` and user text prefix `A2UI actionResponse`.
- Backend may short-circuit full agent turn for that ack.

## Reference files

| Layer | Path |
|-------|------|
| Tool | `hermes/tools/a2ui_render_tool.py` |
| Extract | `hermes/hermes_cli/agui_a2ui.py` |
| SSE | `hermes/hermes_cli/agui_endpoint.py` |
| Processor | `ui/src/lib/a2ui/processor.ts` |
| Surface | `ui/src/components/a2ui/A2UISurface.tsx` |
| Attach | `ui/src/stores/chat.ts` (`attachA2uiSurface`) |

## Acceptance

- [ ] “Show a contact form on the UI” → interactive card, not HTML source.
- [ ] “All of them / in parallel” → multiple DynamicForms stacked.
- [ ] Submit shows toast + agent ack.
- [ ] Reload session restores the form surface.
