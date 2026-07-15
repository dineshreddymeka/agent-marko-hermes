# AG-UI Events (Marko)

Chat transport is **AG-UI over SSE**: `POST /agui` with `Accept: text/event-stream`.

Wire format: `data: {json}\n\n`

## Request (minimal)

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

## Standard events (backend → UI)

| Event | Key fields | UI effect |
|-------|------------|-----------|
| `RUN_STARTED` | `threadId`, `runId` | `runStatus=running`, stage `starting` |
| `THINKING_*` | thinking deltas | stage `thinking` |
| `TEXT_MESSAGE_START/CONTENT/END` | `messageId`, `delta` | assistant bubble; stage `writing` |
| `TOOL_CALL_START/ARGS/END/RESULT` | tool ids + args | tool cards; stage `tool` |
| `RUN_FINISHED` | `threadId`, `runId` | stage `done` (~1.2s) then clear |
| `RUN_ERROR` | `message`, `code` | error banner |

## Marko `CUSTOM` events

Constants: `packages/shared/src/agui-events.ts`

| `name` | `value` | Purpose |
|--------|---------|---------|
| `hermes.title` | `{ title, sessionId? }` | Sidebar + header session title |
| `a2ui.message` | `{ surfaceId, component, complete?, data?, parentMessageId? }` | Interactive A2UI surface |
| `hermes.context` | `{ tokensUsed, tokensMax?, sessionId? }` | Token ring / footer |
| `hermes.approval.required` | `{ toolCallId, toolName, args }` | Approval card |
| `hermes.skill.learned` | `{ skillId, skillName }` | Toast |
| `hermes.cron.fired` | `{ jobId, jobName }` | Toast |
| `hermes.cowork.progress` | `{ taskId, phase, … }` | Cowork progress |

### Example: title

```json
{
  "type": "CUSTOM",
  "name": "hermes.title",
  "value": { "title": "NJ", "sessionId": "<threadId>" }
}
```

### Example: DynamicForm

```json
{
  "type": "CUSTOM",
  "name": "a2ui.message",
  "value": {
    "surfaceId": "a2ui-abc",
    "complete": true,
    "parentMessageId": "<assistant-message-id>",
    "component": {
      "id": "contact-form",
      "type": "hermes:DynamicForm",
      "props": {
        "title": "Contact",
        "fields": [
          { "name": "email", "label": "Email", "type": "email", "required": true }
        ],
        "submitLabel": "Send"
      }
    }
  }
}
```

## Client guards

- Ignore events when `event.runId !== active runId` (after reset / abort).
- Scope working chrome with `runSessionId === viewedSessionId`.
- On session switch: reset run UI unless `/api/sessions/{id}/live` says live.

## Reference files

| Layer | Path |
|-------|------|
| Backend | `hermes/hermes_cli/agui_endpoint.py` |
| Client | `ui/src/lib/agui/client.ts` |
| Dispatcher | `ui/src/lib/agui/dispatcher.ts` |
| Shared names | `packages/shared/src/agui-events.ts` |
