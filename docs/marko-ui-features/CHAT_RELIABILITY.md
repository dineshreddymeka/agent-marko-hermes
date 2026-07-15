# Chat Reliability — Detailed Implementation

## Goal

Chat runs must not stick in “Working…”, must not apply stale SSE after abort, and must restore correctly only when a session is actually live.

## Run identity

### Client sets `runId` before request

**File:** `ui/src/lib/agui/client.ts`

```ts
const runId = generateId()
chat.setRunId(runId)
chat.setRunStatus('running')
chat.setRunSessionId(sessionId)
chat.clearStage()
chat.setStage('starting')
// then HttpAgent.runAgent({ runId, … })
```

### Ignore superseded events

**File:** `ui/src/lib/agui/dispatcher.ts`

```ts
function isCurrentRun(eventRunId?: string | null): boolean {
  if (eventRunId == null || eventRunId === '') return true
  const active = useChatStore.getState().runId
  if (active == null) return false  // after resetRun — reject late DONE
  return String(eventRunId) === active
}
```

Apply to `RUN_FINISHED`, `RUN_ERROR`, and preferably tool/text events that carry `runId`.

## Cancel / abort

1. User hits Stop / Esc → `cancelRun()`.
2. Abort in-flight fetch/SSE.
3. `finalizeRunUi` + `runStatus` idle/cancelled.
4. Late `RUN_FINISHED` from old run must not revive chrome (`isCurrentRun` false).

**Files:** `agui/client.ts`, `Composer.tsx`, `useKeyboardShortcuts.ts`

## Startup stall watchdog

If stage stays `starting` with no progress for ~15s:

```ts
recoverRunFromStartingStall()
// → setError('Run startup timed out…'), idle
```

**Constant:** `STARTUP_STALL_TIMEOUT_MS = 15_000` in `client.ts`.

## Stale running recovery

After reload, store may say `running` with no `runId`:

```ts
recoverStaleRunIfNeeded()
// clearStreamingState, clearStage, idle
```

Call from Composer mount / shell boot.

## Live run probe

```
GET /api/sessions/{id}/live → { live: boolean, runId?: string }
```

**ChatColumn algorithm:**

```
on sessionId change:
  if isLiveRunOnSession(sessionId): skip reset
  else: clearStreamingState(); resetRun()
  loadSessionMessages(sessionId)
  live = await checkLiveRun(sessionId)
  if live: startLiveMessagePoll(sessionId)
  else if !isLiveRunOnSession(sessionId): clearHistoricalRunUi()
```

**Important:** do not call `resetRun()` after load if the user just started a send on this session (race with `/live` returning false).

## Message merge

`loadSessionMessages` must not wipe optimistic/streamed rows with empty server snapshots.

`stripStreaming` only when confirmed non-live history.

## Implementation steps

1. Add `runId`, `runSessionId`, `runStatus`, `runStage` to chat store + `resetRun()`.
2. Set them at start of `runAgent`; clear on finish/error/abort.
3. Gate dispatcher with `isCurrentRun`.
4. Implement cancel + Esc shortcut.
5. Add startup watchdog + stale recovery.
6. Implement `/live` + ChatColumn session-switch rules.
7. Tests: `ui/test/session-history-run-ui.test.ts`.

## Acceptance

- [ ] Abort leaves UI idle; no sticky Done from late SSE.
- [ ] Opening history clears working chrome.
- [ ] Active run on current session survives remount/StrictMode.
- [ ] Stall in starting surfaces an error within ~15s.

## Reference files

| Concern | Path |
|---------|------|
| Client | `ui/src/lib/agui/client.ts` |
| Dispatcher | `ui/src/lib/agui/dispatcher.ts` |
| Store | `ui/src/stores/chat.ts` |
| Column | `ui/src/components/shell/ChatColumn.tsx` |
| Live API | `hermes/hermes_cli/web_server.py` (`marko_session_live`) |
| Tests | `ui/test/session-history-run-ui.test.ts` |
