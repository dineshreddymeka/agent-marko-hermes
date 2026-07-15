# Session Titles (Auto-Summarization)

Keeps the sidebar/header from staying **New chat** / **Untitled** after the first reply.

## Behavior

1. `POST /api/sessions` with placeholder title (`New chat`, `Untitled`, …) → **persist `NULL`**, return display `"New chat"`.
2. On early AG-UI turns (1st–2nd user message), backend:
   - Sets a **heuristic title** from the user message immediately (e.g. `nj` → `NJ`).
   - Emits `CUSTOM hermes.title` on the **same SSE stream**.
   - Optionally upgrades via LLM `title_generation` in a background thread (own DB handle).
3. UI applies `hermes.title` to the sessions store; on `RUN_FINISHED`, client fallback titles from the first user message if still placeholder.
4. Session list refetch **must not** overwrite a live non-placeholder title with API `null` → `"New chat"`.

## Placeholder set

Treat as empty (do not persist as final titles):

- `""`, `new chat`, `untitled`, `untitled session`, `untitled chat`

## Heuristic rules

- Normalize whitespace; strip prefixes like `please` / `can you` / `hey`.
- Single short alpha token (≤4 chars) → uppercase (`nj` → `NJ`).
- Otherwise first ~7 words, ≤64 chars, light title-case.

## Unique titles

`set_session_title` enforces uniqueness. On conflict, use lineage suffix (`NJ #2`) via `get_next_title_in_lineage`.

## Frontend merge

`mergeSessionsPreservingTitles(local, incoming)` in `ui/src/lib/session-title.ts`:

- If API title is placeholder and local title is real → keep local.
- Keep optimistic local-only rows not yet in the API list.

`updateSession` **upserts** if the row is missing (so `hermes.title` always sticks).

## Reference files

| Layer | Path |
|-------|------|
| Title logic | `hermes/agent/title_generator.py` |
| Emit path | `hermes/hermes_cli/agui_endpoint.py` |
| Create session | `hermes/hermes_cli/web_server.py` (`create_session_marko`) |
| Display adapter | `ui/src/lib/hermes-adapters.ts` (`displaySessionTitle`) |
| Merge helper | `ui/src/lib/session-title.ts` |
| Dispatcher | `ui/src/lib/agui/dispatcher.ts` (`hermes.title`, `ensureSessionTitleFromChat`) |
| Store | `ui/src/stores/sessions.ts` |

## Acceptance

- [ ] Empty session shows **New chat**, never **Untitled**.
- [ ] After first reply, sidebar + header show a real title without LLM keys.
- [ ] Refetching `/api/sessions` does not revert the live title to **New chat**.
- [ ] Duplicate short titles get `#2` suffix instead of silent DB failure.
