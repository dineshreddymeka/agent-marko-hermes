# AG-UI Events — Detailed Implementation

## Transport

```
POST /agui
Content-Type: application/json
Accept: text/event-stream
X-Hermes-Session-Token: <token>

→ SSE frames: data: {json}\n\n
```

**Backend:** `hermes/hermes_cli/agui_endpoint.py`  
**Client:** `ui/src/lib/agui/client.ts` (`HttpAgent` from `@ag-ui/client`)  
**Dispatch:** `ui/src/lib/agui/dispatcher.ts`

## Request body

```json
{
  "threadId": "<session-uuid>",
  "runId": "<run-uuid>",
  "messages": [
    { "id": "u1", "role": "user", "content": "…" },
    { "id": "a1", "role": "assistant", "content": "…" }
  ],
  "tools": [ /* frontend tool schemas */ ],
  "context": [],
  "state": { "todos": [], "a2uiAction": null },
  "forwardedProps": { "profileId": "default" }
}
```

History rule: all messages except the trailing user turn(s) become agent `conversation_history`; latest user text is the prompt.

## Backend loop (implement)

```
emit RUN_STARTED
ensure_marko_session(threadId)
set HERMES_PLATFORM=marko
create AIAgent(… callbacks …, ephemeral_system_prompt=MarkoRules)
run_conversation(user_text, history)
  on_stream_delta → TEXT_MESSAGE_* 
  on_reasoning → THINKING_*
  on_tool_start/complete → TOOL_CALL_* + maybe CUSTOM a2ui.message
sync heuristic hermes.title (early turns)
optional hermes.context
emit RUN_FINISHED
finally: restore HERMES_PLATFORM, close db
```

Empty user text → `RUN_ERROR` code `empty_input` (after STARTED).

## Standard events

| Event | Required fields | Dispatcher effect |
|-------|-----------------|-------------------|
| `RUN_STARTED` | `threadId`, `runId` | running + stage starting + runSessionId |
| `RUN_FINISHED` | `threadId`, `runId` | done settle; title fallback; idle |
| `RUN_ERROR` | `message`, `code?` | error or clear if abort |
| `TEXT_MESSAGE_START` | `messageId`, `role` | ensure assistant msg; writing |
| `TEXT_MESSAGE_CONTENT` | `messageId`, `delta` | append content |
| `TEXT_MESSAGE_END` | `messageId` | streaming false |
| `THINKING_START` / `THINKING_END` | | thinking chrome |
| `THINKING_TEXT_MESSAGE_*` | `messageId`, `delta` | thinking buffer |
| `TOOL_CALL_START` | `toolCallId`, `toolCallName`, `parentMessageId?` | tool card; stage tool |
| `TOOL_CALL_ARGS` | `toolCallId`, `delta` | stream args JSON |
| `TOOL_CALL_END` | `toolCallId` | execute frontend tool if any |
| `TOOL_CALL_RESULT` | `toolCallId`, `content` | result body |
| `STEP_STARTED` / `STEP_FINISHED` | `stepId`, `stepName` | runSteps chips |
| `STATE_SNAPSHOT` / `STATE_DELTA` | state / ops | agentState store |
| `MESSAGES_SNAPSHOT` | messages[] | replace session transcript |

### Delta granularity (server-side coalescing)

`TEXT_MESSAGE_CONTENT` and `THINKING_TEXT_MESSAGE_CONTENT` deltas are
**coalesced server-side into ~16 ms frames** (512-char cap) — one event may
carry many LLM tokens. Clients must treat `delta` as an arbitrary-length
append, never assume one token per event. Ordering is guaranteed: all
buffered deltas are flushed to the wire before any structural event
(`*_END`, `TOOL_CALL_*`, `CUSTOM`, `RUN_FINISHED`, `RUN_ERROR`). See
[HARNESS_PERFORMANCE.md](./HARNESS_PERFORMANCE.md) §2. Also per that spec,
`RUN_STARTED` is emitted by the HTTP handler before the agent worker
spawns, so it arrives within milliseconds of the POST.

## CUSTOM events (Marko)

Constants: `packages/shared/src/agui-events.ts` (`HermesCustomEvents`)

| name | value | UI |
|------|-------|-----|
| `hermes.title` | `{ title, sessionId? }` | sessions store upsert |
| `a2ui.message` | `{ surfaceId, component, complete?, data?, parentMessageId? }` | A2UI processor + attach |
| `hermes.context` | `{ tokensUsed, tokensMax?, sessionId? }` | context ring |
| `hermes.approval.required` | `{ toolCallId, toolName, args }` | ApprovalCard |
| `hermes.skill.learned` | `{ skillId, skillName }` | toast |
| `hermes.cron.fired` | `{ jobId, jobName }` | toast |
| `hermes.cowork.progress` | `{ taskId, phase, text?, … }` | tool card progress |

Defined in shared but not always dispatched yet: `hermes.tool.error`, `hermes.capabilities.degraded`, `hermes.delegation`.

### Payload examples

**Title**

```json
{ "type": "CUSTOM", "name": "hermes.title",
  "value": { "title": "NJ", "sessionId": "…" } }
```

**A2UI**

```json
{ "type": "CUSTOM", "name": "a2ui.message",
  "value": {
    "surfaceId": "a2ui-1",
    "complete": true,
    "parentMessageId": "asst-1",
    "component": {
      "id": "form-1",
      "type": "hermes:DynamicForm",
      "props": { "title": "Contact", "fields": [] }
    }
  } }
```

## Client implementation details

1. `currentSessionId = sessionId` **before** subscribing to SSE so CUSTOM handlers receive sessionId.
2. `isCurrentRun(event.runId)` after `resetRun()` rejects late events (`runId` null → false for scoped events).
3. Frontend tools: include schemas in request `tools`; execute on `TOOL_CALL_END`.
4. Approval: `respondToApproval` posts decision (when APIs exist).

## Tests

- `ui/test/dispatcher-phase4.test.ts` — CUSTOM hermes.title / a2ui / toasts
- `hermes/tests/hermes_cli/test_agui_endpoint.py` — SSE wiring

## Porting checklist

- [ ] SSE framing correct
- [ ] RUN_* + TEXT_* + TOOL_* parity
- [ ] CUSTOM title + a2ui.message
- [ ] parentMessageId on a2ui
- [ ] runId guards
- [ ] Marko ephemeral prompt + platform env

## See also

- [SESSION_TITLES.md](./SESSION_TITLES.md)
- [A2UI_FORMS.md](./A2UI_FORMS.md)
- [WORKING_DONE_EFFECTS.md](./WORKING_DONE_EFFECTS.md)
- [CHAT_RELIABILITY.md](./CHAT_RELIABILITY.md)
- [FRONTEND_TOOLS.md](./FRONTEND_TOOLS.md)
