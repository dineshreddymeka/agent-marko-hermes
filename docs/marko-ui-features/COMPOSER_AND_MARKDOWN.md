# Composer & Streaming Markdown — Detailed Implementation

## Goal

Chat input that sends AG-UI runs, supports slash commands and file attachments, and renders assistant streams as rich markdown (GFM, code, math, diagrams) **without** executing raw HTML forms.

## Composer

**File:** `ui/src/components/chat/Composer.tsx`

### Send flow

```
1. If no sessionId → createPersistedSession('New chat') → navigate
2. Add optimistic user message to chat store
3. runAgent({ sessionId, content, profileId? })
4. While running: show Stop; Esc cancels
```

### Stop

Calls `cancelRun()` from `agui/client.ts` (abort SSE + reset UI).

### Empty session create

Use `createPersistedSession` / `createHermesSession` so store + API stay consistent (see [SESSION_TITLES.md](./SESSION_TITLES.md)).

## Slash commands

**File:** `ui/src/lib/slash-commands.ts`

Built-ins (examples):

| Command | Behavior |
|---------|----------|
| `/new` | New session |
| `/clear` | Clear local transcript view / confirm |
| `/model` | Focus model settings |
| `/theme` | Cycle theme |
| `/workspace` etc. | `switch_panel` equivalent |

Also merge MCP slash commands from [CAPABILITIES.md](./CAPABILITIES.md).

Composer detects leading `/` and shows autocomplete; on submit runs command or sends as normal text.

## Attachments

**File:** `ui/src/lib/workspace-upload.ts`

1. User picks UTF-8 text file(s).
2. `POST /api/fs/write-text` (or workspace write alias) under workspace path.
3. Append `[Attached: relative/path]` to the outgoing message content.

## Streaming markdown

**File:** `ui/src/components/chat/StreamingMarkdown.tsx`

| Capability | Library / approach |
|------------|--------------------|
| GFM markdown | `react-markdown` + remark-gfm |
| Math | KaTeX / rehype-katex |
| Diagrams | Mermaid (lazy) |
| Code highlight | Shiki worker (`workers/shiki.worker.ts`) + `CodeBlock.tsx` |

### Critical rule

**Do not enable `rehype-raw`.** Assistant HTML must not become interactive DOM forms. Interactive UI is A2UI only ([A2UI_FORMS.md](./A2UI_FORMS.md)).

### Streaming UX

- While `streaming=true`, apply `streaming-response` / caret / shimmer classes.
- Pace token release optionally via `stream-pacing.ts` + `useReducedMotion`.

## Thinking block

**File:** `ThinkingBlock.tsx`

Collapsible; shows thinking stream; settles when thinking ends.

## Tool cards

**File:** `ToolCallCard.tsx`

Statuses: `pending` → `streaming-args` → `executing` → `done` / `error`.  
Labels from `labels.ts`. Cowork progress merges via `cowork-progress.ts`.

## Implementation steps

1. Composer controlled textarea + send/stop.
2. Wire `runAgent` / `cancelRun`.
3. Slash registry + autocomplete UI.
4. File attach → FS write → message suffix.
5. StreamingMarkdown without raw HTML.
6. ThinkingBlock + ToolCallCard under MessageBubble.
7. Empty-state suggestion chips in `ChatColumn`.

## Acceptance

- [ ] Enter sends; Stop aborts; Esc cancels when running.
- [ ] `/new` creates a session.
- [ ] Attached files appear in workspace and in message text.
- [ ] Code fences highlight; HTML form source does not become a live form.
- [ ] Thinking and tool cards update during the run.

## Reference files

| Concern | Path |
|---------|------|
| Composer | `ui/src/components/chat/Composer.tsx` |
| Slash | `ui/src/lib/slash-commands.ts` |
| Upload | `ui/src/lib/workspace-upload.ts` |
| Markdown | `ui/src/components/chat/StreamingMarkdown.tsx` |
| Code | `ui/src/components/chat/CodeBlock.tsx` |
| Thinking | `ui/src/components/chat/ThinkingBlock.tsx` |
| Tools UI | `ui/src/components/chat/ToolCallCard.tsx` |
| Pacing | `ui/src/lib/stream-pacing.ts` |
