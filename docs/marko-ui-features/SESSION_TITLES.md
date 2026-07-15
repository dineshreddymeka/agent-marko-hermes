# Session Titles (Auto-Summarization) — Detailed Implementation

## Problem

Without this feature, every chat stays labeled **New chat** / **Untitled** in the sidebar and header even after a full conversation (e.g. user said `nj`, got a New Jersey essay, title never changed).

## End-to-end flow

```
POST /api/sessions { title: "New chat" }
  → persist title = NULL
  → response title = "New chat" (display only)

User sends first message → POST /agui
  → assistant streams reply
  → BEFORE RUN_FINISHED:
       heuristic_title(user_text)  // sync, no LLM required
       db.set_session_title(id, title)  // with unique-suffix retry
       emit CUSTOM hermes.title { title, sessionId }
  → optional background LLM upgrade (own DB connection)

UI dispatcher:
  → sessions.updateSession(sessionId, { title })  // upsert if missing

SessionsPanel refetch:
  → setSessions(mergeSessionsPreservingTitles(local, api))
  → must NOT replace live "NJ" with API null → "New chat"

RUN_FINISHED client fallback:
  → if still placeholder, title from first user message in chat store
```

## Backend implementation

### 1. Placeholder helpers

**File:** `hermes/agent/title_generator.py`

```python
_PLACEHOLDER_TITLES = frozenset({
    "", "new chat", "untitled", "untitled session", "untitled chat",
})

def is_placeholder_title(title: Optional[str]) -> bool: …
def heuristic_title(user_message: str, max_words=7, max_len=64) -> Optional[str]: …
```

Heuristic rules:

1. Collapse whitespace.
2. Strip prefixes: `please `, `can you `, `could you `, `hey `, `hi `, `hello `.
3. Single alpha token ≤4 chars → **uppercase** (`nj` → `NJ`).
4. Else first ≤7 words, ≤64 chars, light title-case, ellipsis if clipped.

### 2. Create session does not persist placeholders

**File:** `hermes/hermes_cli/web_server.py` — `create_session_marko`

```python
display_title = raw if raw and not is_placeholder_title(raw) else "New chat"
persist_title = display_title if raw and not is_placeholder_title(raw) else None
# only set_session_title when persist_title is not None
return { …, "title": row.get("title") or display_title, … }
```

### 3. Sync title on early AG-UI turns

**File:** `hermes/hermes_cli/agui_endpoint.py`

After text/tools, before `hermes.context` / `RUN_FINISHED`:

```python
reply_for_title = final or ("…" if started_text else "")
prior_users = sum(1 for m in history if m.get("role") == "user")
early_turn = prior_users <= 1  # current user msg not in history yet
needs_title = early_turn and is_placeholder_title(db.get_session_title(thread_id))

if user_text and reply_for_title and needs_title:
    quick = heuristic_title(user_text)
    if quick:
        try:
            db.set_session_title(thread_id, quick)
        except UniqueConflict:
            quick = db.get_next_title_in_lineage(quick)  # "NJ #2"
            db.set_session_title(thread_id, quick)
        emit({
            "type": "CUSTOM",
            "name": "hermes.title",
            "value": {"title": quick, "sessionId": thread_id},
        })
    # optional: Thread(target=auto_title_session, db=open_session_db(...))
```

**Do not** wait on LLM before emitting. LLM title_generation often fails with no API keys and used to block/miss the SSE stream.

### 4. `auto_title_session` (LLM + heuristic)

```python
existing = session_db.get_session_title(session_id)
if existing and not is_placeholder_title(existing):
    return
title = generate_title(...) or heuristic_title(user_message)
session_db.set_session_title(session_id, title)
title_callback(title)  # optional
# on set failure: still call title_callback so UI updates
```

Log persist failures at **warning**, not debug.

### 5. Unique title conflicts

SessionDB unique index on `title`. On conflict use lineage helper (`get_next_title_in_lineage`) → `"NJ #2"`.

## Frontend implementation

### 1. Display adapter

**File:** `ui/src/lib/hermes-adapters.ts`

```ts
function displaySessionTitle(row): string {
  if (!isPlaceholderSessionTitle(row.title)) return trim(row.title)
  if (row.preview) return clip(preview, 64)
  return 'New chat'
}
```

Shared placeholder helper: `ui/src/lib/session-title.ts` → `isPlaceholderSessionTitle`.

### 2. Preserve titles on list refetch

```ts
// sessions store setSessions
setSessions(incoming) {
  set({ sessions: mergeSessionsPreservingTitles(get().sessions, incoming) })
}
```

`mergeSessionsPreservingTitles`:

- If API title is placeholder and local title is real → keep local.
- Keep local-only optimistic rows not yet returned by API.

### 3. `updateSession` upsert

If `hermes.title` arrives before the row exists in the store, **create** the row (don’t no-op).

### 4. Dispatcher

```ts
case CUSTOM hermes.title:
  targetId = payload.sessionId || sessionId
  if (targetId && nonEmptyTitle) updateSession(targetId, { title })

case RUN_FINISHED:
  ensureSessionTitleFromChat(sessionId)  // client heuristic fallback
```

### 5. Sidebar create path

Use `createPersistedSession` / adapter — not a raw POST that bypasses store upserts inconsistently.

### 6. Header binding

`ChatColumn` reads `activeSession?.title` from sessions store — updates when `updateSession` fires.

## Tests to mirror

| Test | Path |
|------|------|
| Display rules | `ui/test/hermes-adapters.test.ts` |
| Merge / upsert | `ui/test/session-titles.test.ts` |
| CUSTOM title | `ui/test/dispatcher-phase4.test.ts` |
| Heuristic / unique | `hermes/tests/agent/test_title_generator.py` |

## Porting checklist

- [ ] Placeholders not persisted
- [ ] Sync heuristic emit on first reply (works offline / no LLM keys)
- [ ] Unique-title suffix
- [ ] UI `hermes.title` + upsert
- [ ] Refetch merge preserves live titles
- [ ] Client RUN_FINISHED fallback
- [ ] Header + sidebar both bound to store title

## Acceptance

- [ ] After first reply, sidebar shows e.g. **NJ**, not **New chat**.
- [ ] Header matches sidebar.
- [ ] Refresh/refetch does not revert the title.
- [ ] Second session with same short prompt becomes **NJ #2**.
