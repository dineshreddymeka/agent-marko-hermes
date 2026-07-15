# Working / Done Chat Effects

Cursor-like activity chrome while the agent runs, cleared when browsing history.

## What the user sees

| Effect | When |
|--------|------|
| **StageStrip** (footer shimmer / Done settle) | Live run on the viewed session |
| **AgentWorkingBubble** (sparkle + “Working…”) | Running, stage active, no live assistant content yet |
| **MessageBubble** sparkle / text shimmer / working dots | Assistant message with `streaming: true` |
| **Skeleton shimmer bars** | Working placeholder |

## State (`ui/src/stores/chat.ts`)

| Field | Purpose |
|-------|---------|
| `runStatus` | `idle \| running \| error \| cancelled` |
| `runId` | Guard stale SSE after abort/reset |
| `runSessionId` | Which session owns the chrome |
| `runStage` | `{ kind, toolName?, startedAt }` |

Stage kinds: `starting` → `thinking` → `tool` → `writing` → `done` / `error`

## CSS (must use Tailwind `@utility`)

Animations live in `ui/src/styles/index.css` as **`@utility`** blocks so `motion-safe:` variants are emitted:

- `text-shimmer`, `agent-sparkle`, `message-enter`, `message-settle`
- `skeleton-shimmer`, `agent-status-settle`
- `working-dots` (+ explicit `motion-safe:working-dots::after`)

Plain `@layer utilities` classes do **not** get `motion-safe:` in Tailwind v4 — effects would be missing.

## Session switch rules

On `sessionId` change (`ChatColumn`):

1. If **this** session already has a live run → do **not** `resetRun()`.
2. Otherwise `clearStreamingState()` + `resetRun()`.
3. Load messages; check `GET /api/sessions/{id}/live`.
4. If live → restore run chrome + poll until done.
5. If not live → clear historical streaming flags + reset (no sticky Done).

`runAppliesToView`: show effects when `runSessionId == null || runSessionId === viewedSessionId`.

## Dispatcher lifecycle

- `RUN_STARTED` → running + `setRunSessionId` + stage `starting`
- Thinking / text / tools → update stage
- `RUN_FINISHED` → `done` for ~1.2s then `clearStage()`; also client title fallback
- After `resetRun()`, `runId` is null → reject late run-scoped events (`isCurrentRun`)

## Reference files

| Layer | Path |
|-------|------|
| Working bubble | `ui/src/components/chat/AgentWorkingBubble.tsx` |
| Stage strip | `ui/src/components/chat/RunProgress.tsx` |
| Message list | `ui/src/components/chat/MessageList.tsx` |
| Session column | `ui/src/components/shell/ChatColumn.tsx` |
| Client / live | `ui/src/lib/agui/client.ts` |
| Styles | `ui/src/styles/index.css` |
| Tests | `ui/test/session-history-run-ui.test.ts` |

## Acceptance

- [ ] Sending a message shows working shimmer / StageStrip on that session.
- [ ] Opening an old session clears working/done chrome (no sticky chatbot bubble).
- [ ] A live run on session A does not show chrome while viewing session B.
- [ ] Done settle appears briefly after finish, then goes away.
