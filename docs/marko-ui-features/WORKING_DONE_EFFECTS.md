# Working / Done Chat Effects — Detailed Implementation

## Problem

Users expect IDE-style activity chrome while the agent runs (shimmer, working bubble, Done settle). Two classes of bugs appeared:

1. **CSS:** `motion-safe:text-shimmer` etc. never applied (Tailwind v4 needs `@utility`).
2. **State:** session remount / history load called `resetRun()` and wiped chrome mid-run; or Done stuck on old sessions.

## What to implement

| UI | Component | Visible when |
|----|-----------|--------------|
| Footer stage strip | `RunProgress.tsx` (`StageStrip`) | Live run for **viewed** session |
| In-thread working row | `AgentWorkingBubble.tsx` | Running + stage active + no live assistant shell yet |
| Bubble sparkle / shimmer | `MessageBubble.tsx` | `message.streaming` |
| Skeleton bars | working bubble | same |

## State machine

**File:** `ui/src/stores/chat.ts`

```ts
runStatus: 'idle' | 'running' | 'error' | 'cancelled'
runId: string | null
runSessionId: string | null
runStage: { kind: RunStageKind, toolName?: string, startedAt: number } | null
runSteps: Array<{ id, name, status }>
```

Kinds: `starting` → `thinking` → `tool` → `writing` → `done` | `error`

### Transitions (dispatcher)

| Event | Action |
|-------|--------|
| `RUN_STARTED` | running, `setRunSessionId`, clearStage, `starting` |
| Thinking start | `thinking` |
| `TOOL_CALL_START` | `tool`, toolName |
| `TEXT_MESSAGE_START` | `writing` |
| `RUN_FINISHED` | finalize streaming tools, `done`, idle, clearStage after 1200ms |
| `RUN_ERROR` | `error` or clear if abort |

Also set `done` in `finishLocalRun` when client completes without waiting solely on SSE.

## CSS (critical)

**File:** `ui/src/styles/index.css`

Define animations as Tailwind v4 **`@utility`** blocks so variants exist:

```css
@utility text-shimmer { … }
@utility agent-sparkle { … }
@utility message-enter { … }
@utility message-settle { … }
@utility skeleton-shimmer { … }
@utility agent-status-settle { … }
```

Add explicit:

```css
.motion-safe\:working-dots::after { … }
```

Components use `motion-safe:text-shimmer`, `motion-safe:agent-sparkle`, etc.

**Wrong:** plain `@layer utilities { .text-shimmer {…} }` — `motion-safe:` won’t compose.

## Gating by session

```ts
// MessageList / StageStrip
runAppliesToView = runSessionId == null || runSessionId === viewedSessionId
```

Show working bubble only if `runAppliesToView && runStatus==='running' && stage not done/error && !hasLiveAssistant`.

## Session switch (ChatColumn)

```
on sessionId change:
  if isLiveRunOnSession(sessionId):
    // do NOT reset — user is viewing the chat that is generating
  else:
    clearStreamingState(); resetRun()

  loadSessionMessages(sessionId)  // do not stripStreaming if might be live

  live = await checkLiveRun(sessionId)
  if live: startLiveMessagePoll
  else if !isLiveRunOnSession(sessionId):
    clearHistoricalRunUi()  // strip streaming flags + resetRun
```

## Implementation steps

1. Add run fields + `setStage` / `clearStage` / `resetRun` to chat store.
2. Wire dispatcher stage transitions.
3. Build StageStrip + AgentWorkingBubble.
4. Add MessageBubble streaming chrome classes.
5. Convert CSS to `@utility` + verify built CSS contains `.motion-safe\:text-shimmer`.
6. Implement ChatColumn live-aware reset (see [CHAT_RELIABILITY.md](./CHAT_RELIABILITY.md)).
7. Tests in `session-history-run-ui.test.ts`.

## Acceptance

- [ ] Send message → shimmer / working bubble appears on that session.
- [ ] Finish → brief Done settle → chrome clears.
- [ ] Open old session → no sticky working chatbot.
- [ ] Live session remount does not kill effects.
- [ ] Reduced motion: animations gated by `motion-safe:`.

## Reference files

| Concern | Path |
|---------|------|
| Bubble | `ui/src/components/chat/AgentWorkingBubble.tsx` |
| Strip | `ui/src/components/chat/RunProgress.tsx` |
| List | `ui/src/components/chat/MessageList.tsx` |
| Message | `ui/src/components/chat/MessageBubble.tsx` |
| Column | `ui/src/components/shell/ChatColumn.tsx` |
| Styles | `ui/src/styles/index.css` |
| Store | `ui/src/stores/chat.ts` |
| Tests | `ui/test/session-history-run-ui.test.ts` |
