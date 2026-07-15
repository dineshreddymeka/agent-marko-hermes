# Agentic Harness — Technical Performance Specification

Scope: the run path `POST /agui` → `_event_stream` → worker thread →
`AIAgent.run_conversation()` → SSE, the SQLite state layer, static serving,
and the launch script. Targets: ultralow latency, low CPU, enterprise
durability, single-node, all state in SQLite.

Line references marked *(pre-change)* describe the tree before the
optimizations landed; implemented sections document the shipped code.

## Implementation status

| Item | What | Status | Commit |
|---|---|---|---|
| L1 | Loop-native SSE bridge (zero-poll) | ✅ shipped | `47dc172` |
| L3 | `RUN_STARTED` before worker spawn | ✅ shipped | `47dc172` |
| C1 | Delta coalescing (~16 ms frames) | ✅ shipped | `47dc172` |
| L2 | Agent-stack preload at startup | ✅ shipped | `a603d9f` |
| S1 | Immutable caching for `/_next/static` | ✅ shipped | `a603d9f` |
| D2 | `synchronous=NORMAL` under WAL | ✅ shipped | `0e72d22` |
| T1 | Content-hash build stamp | ✅ shipped | `a59de34` |
| T2 | Tight script wait loops | ✅ shipped | `a59de34` |
| L4 | Per-profile `SessionDB` reuse | ⏳ pending | — |
| L5 | `AIAgent` init caching | ⏳ deferred (profile first) | — |
| C2 | Client streaming render deferral (stable/tail split + memoized bubbles + 8× pacing) | ✅ shipped | `19a1aa9`, `e598f38` |
| C3 | uvloop + httptools | ⏳ pending | — |
| C4 | Cooperative cancellation checkpoints | ⏳ pending | — |
| D1 | Scheduled `VACUUM INTO` backups | ⏳ pending | — |
| D3 | Startup integrity probe | ⏳ pending | — |
| S2 | Build-time precompression | ⏳ pending | — |
| S3 | Visibility-gated client polling | ✅ shipped | `343897e` |
| T3 | Incremental dist copy | ⏳ pending | — |
| T4 | Bytecode precompile in env setup | ⏳ pending | — |

### Measured results (after; no-LLM environment, loopback)

| Gate | Before | Target | Achieved |
|---|---|---|---|
| TTFE (POST → `RUN_STARTED` on wire) | 5–50 ms + 250 ms worst-case poll | < 2 ms | **3.3–5.5 ms end-to-end via urllib** (server-side write is immediate; client HTTP overhead dominates) |
| Idle wakeups per active stream | 4/s | 0 | **0** (event-driven `asyncio.Queue`) |
| Per-event overhead | 1 threadpool hop | < 0.1 ms | **`call_soon_threadsafe` handoff** |
| SSE events per streamed reply | ≈ token count | ≤ tokens/10 | **400 synthetic deltas → < a few dozen events** (test-verified, no token loss) |
| First-run import penalty | +0.6–2 s | 0 | **preloaded in lifespan executor** |
| RSS soak (20 runs) | — | < 150 MB | **135 → 136 MB, threads 6 → 6** (no leaks) |
| Warm script start | 3–8 s (or minutes w/ build) | < 2 s | **1.4–1.6 s** |
| Durability drill | — | quick_check ok | **`kill -9` mid-run → `PRAGMA quick_check` = ok, 24 sessions intact** |
| Commit durability | fsync/commit (`FULL`) | WAL + `NORMAL` | **verified: `journal_mode=wal`, `synchronous=1`** |
| Hashed static assets | revalidate per load | immutable | **`cache-control: public, max-age=31536000, immutable` verified** |

Tests: `tests/hermes_cli/test_agui_endpoint.py` 9 passed (incl. new
coalescer unit + ordering/no-token-loss stream test); AG-UI/A2UI suites 12
passed; `tests/hermes_state` 41 passed.

---

## 0. Measured baseline (pre-optimization)

| Metric | Value | Method |
|---|---|---|
| Steady-state RSS | 91 MB / 4 threads | `/proc/<pid>/status` |
| Idle CPU | 0.0% | `top -b -n 2 -d 2` |
| Framework floor (python → +fastapi/pydantic → +uvicorn/starlette) | 11 → 39 → 42 MB | `ru_maxrss` after imports |
| `import hermes_cli.web_server` | 0.46 s warm / 57 MB | `time.perf_counter` |
| `import run_agent` (agent stack, ~87k LOC) | 0.61 s warm / 69 MB | same |
| `uvloop`, `httptools` | not installed | `import` probe |
| uvicorn | `log_level="warning"`, access log off | `web_server.py:17655` |
| SSE bridge | `queue.Queue` + `asyncio.to_thread(get, True, 0.25)` | `agui_endpoint.py:682` |
| Events per token | 1 (`TEXT_MESSAGE_CONTENT` per `stream_delta_callback`) | `agui_endpoint.py:319` |
| Per-run costs | `AIAgent` ctor + `open_session_db` + (first run) agent import | `agui_endpoint.py:410–451` |
| SQLite `synchronous` | default `FULL` (no pragma set) | grep `hermes_state.py` |
| Static `/_next` | `StaticFiles`, no cache headers | `web_server.py:16269–16271` |
| Backups / integrity cron | none | grep |

### Latency / resource gates (acceptance)

| Gate | Now (est.) | Target |
|---|---|---|
| TTFE (POST → `RUN_STARTED` on wire) | 5–50 ms | **< 2 ms** |
| Harness TTFT overhead (excl. LLM), warm | ~10–50 ms; run #1 +0.6–2 s | **< 20 ms, every run** |
| Per-event overhead | 1 threadpool hop | **< 0.1 ms** |
| SSE events per streamed reply | ≈ token count | **≤ tokens/10** |
| Idle wakeups per active stream | 4/s | **0** |
| RSS @ 5 concurrent streams | unmeasured | **< 150 MB** |
| Cold script start (warm dist) | 3–8 s | **< 2 s** |
| Commit durability | fsync/commit (FULL) | WAL + NORMAL: fsync/checkpoint, corruption-safe |

---

## 1. L1 — Loop-native event handoff (removes polling + threadpool hop)

**Status: ✅ shipped** (`47dc172`) — `hermes_cli/agui_endpoint.py`

**Previous *(pre-change)*:** `_run_agent_sync(out_q: queue.Queue, ...)` put
events; the consumer loop did `await asyncio.to_thread(out_q.get, True, 0.25)`
— one threadpool dispatch per event, 4 idle wakeups/s, disconnect noticed
≤ 250 ms late.

**Shipped shape** (worker callable is named `emit_event` in the code;
`RUN_STARTED` yield shown is L3):

```python
# _event_stream
async def _event_stream(request: Request, input_data: RunAgentInput) -> AsyncIterator[str]:
    loop = asyncio.get_running_loop()
    aq: asyncio.Queue[Optional[Dict[str, Any]]] = asyncio.Queue()
    cancel = threading.Event()

    def emit(event: Optional[Dict[str, Any]]) -> None:
        # Worker-thread side. None = end-of-stream sentinel.
        if event is not None and cancel.is_set():
            return
        try:
            loop.call_soon_threadsafe(aq.put_nowait, event)
        except RuntimeError:
            cancel.set()   # loop closed (shutdown) — stop producing

    yield _sse({"type": "RUN_STARTED", "threadId": input_data.threadId,
                "runId": input_data.runId})              # L3, see §3

    worker = threading.Thread(
        target=_run_agent_sync,
        kwargs={"input_data": input_data, "emit": emit, "cancel": cancel},
        name=f"agui-{input_data.runId[:8]}", daemon=True)
    worker.start()
    try:
        while True:
            event = await aq.get()      # zero-poll; wakes per event
            if event is None:
                break
            yield _sse(event)
    finally:
        # Client disconnect: starlette cancels this generator at the await
        # point → CancelledError → finally runs immediately (vs 250 ms poll).
        cancel.set()
        await asyncio.to_thread(worker.join, 2.0)
```

**`_run_agent_sync` signature change:** `out_q` → `emit: Callable[[Optional[Dict[str, Any]]], None]`.
All `out_q.put(x)` → `emit(x)`; final `out_q.put(None)` → `emit(None)`
(sentinel must bypass the `cancel` guard — see guard above).

**Invariants:**
- `emit` is called only from the worker thread; `call_soon_threadsafe` is the
  only loop entry point.
- Sentinel `None` is always emitted in the worker's `finally` (already the
  case at :659) so the generator always terminates.
- Queue is unbounded; producer rate is bounded by C1 coalescing (§2), and
  `cancel` stops production on disconnect, so growth is bounded by one
  flush window.

**Failure modes:** loop shutdown mid-run → `RuntimeError` swallowed, cancel
set, worker unwinds at next checkpoint. No change to event ordering.

**Rollback:** revert to `queue.Queue` bridge; no schema/API impact.

---

## 2. C1 — Delta coalescing (~16 ms frames)

**Status: ✅ shipped** (`47dc172`) — `_DeltaCoalescer` in
`hermes_cli/agui_endpoint.py`; the flushing `emit()` wrapper in
`_run_agent_sync` enforces the ordering invariants below. Verified by
`test_agui_deltas_coalesce_and_flush_before_structural_events` and
`test_delta_coalescer_unit`.

**Design:** single-threaded inline coalescer (delta callbacks are sequential
on the worker thread — no timer, no locks):

```python
class _DeltaCoalescer:
    __slots__ = ("emit", "etype", "message_id", "buf", "first_ts")
    WINDOW_S = 0.016
    MAX_CHARS = 512

    def __init__(self, emit, etype: str, message_id: str):
        self.emit, self.etype, self.message_id = emit, etype, message_id
        self.buf: list[str] = []
        self.first_ts = 0.0

    def add(self, delta: str) -> None:
        if not self.buf:
            self.first_ts = time.monotonic()
        self.buf.append(delta)
        if (time.monotonic() - self.first_ts >= self.WINDOW_S
                or sum(map(len, self.buf)) >= self.MAX_CHARS):
            self.flush()

    def flush(self) -> None:
        if self.buf:
            self.emit({"type": self.etype, "messageId": self.message_id,
                       "delta": "".join(self.buf)})
            self.buf.clear()
```

Two instances per run: `TEXT_MESSAGE_CONTENT` / `THINKING_TEXT_MESSAGE_CONTENT`.

**Ordering invariants (all mandatory):**
1. `text.flush()` + `thinking.flush()` before **any** non-delta emit:
   `TEXT_MESSAGE_END`, `THINKING_*_END`, `TOOL_CALL_*`, `CUSTOM`,
   `RUN_FINISHED`, `RUN_ERROR`. Implement by routing every non-delta emit
   through a `emit_flushing(event)` helper that flushes both coalescers first.
2. `finish_thinking()` and `ensure_text_start()` call sites keep their
   current order; the coalescer sits strictly between callback and `emit`.
3. On exception path (:640–653) flush before `TEXT_MESSAGE_END`/`RUN_ERROR`.

**Latency bound:** a buffered fragment is held at most
`WINDOW_S` beyond its arrival **or** until the next event of any type —
below one 60 Hz display frame; perceived streaming unchanged.

**Expected effect:** SSE events per reply ÷ ~10; serialization +
`call_soon_threadsafe` + client parse/render cost ÷ ~10.

### C2 — Client-side streaming render deferral

**Status: ✅ shipped** (`19a1aa9`, `e598f38`). The implemented design goes
further than the original sketch — three compounding fixes:

1. **Stable/tail markdown split** (`StreamingMarkdown.tsx`,
   `splitStableMarkdown`): streamed content is split at the last blank-line
   block boundary outside code fences. The stable prefix renders once with
   the full pipeline (KaTeX, shiki, mermaid) inside a `memo()` component and
   never re-renders until a new block completes; only the short tail
   re-parses per frame, through a light gfm-only pass (plain `<pre>` code,
   no math, no mermaid). Split correctness (fence handling, monotonic
   growth) is unit-tested in `ui/test/streaming-markdown-split.test.ts`.
2. **Memoized `MessageBubble`** + identity-stable store commits
   (`stores/chat.ts` keeps untouched sessions' message arrays identical per
   flush): settled bubbles stop re-rendering 60×/s while another message
   streams.
3. **Typewriter pacing un-throttled** (`stream-pacing.ts`): 3 → 24
   chars/frame (~1.4k chars/s at 60 fps) with proportional backlog drain in
   ~4 frames. The old 3-chars/frame crawl (180 chars/s) made the app *feel*
   sluggish regardless of server speed — visible text lagged far behind the
   wire on any real reply.

---

## 3. L2/L3 — Agent-stack preload + immediate `RUN_STARTED`

**Status: ✅ shipped** (`a603d9f` for L2, `47dc172` for L3).

**L2 — file:** `hermes_cli/web_server.py` `_lifespan`. After the existing
`_warm_gateway_module` executor call:

```python
def _warm_agent_stack() -> None:
    try:
        import run_agent                      # noqa: F401  (0.61 s, +12 MB)
        import tools.a2ui_render_tool         # noqa: F401
        from agent import title_generator     # noqa: F401
        from hermes_cli import marko_session  # noqa: F401
    except Exception:
        _log.debug("agent stack preload failed", exc_info=True)

asyncio.get_event_loop().run_in_executor(None, _warm_agent_stack)
```

Python module cache is process-wide → first `/agui` run skips the import
entirely. Runs in a worker thread; does not delay socket readiness.

**L3:** `RUN_STARTED` moved from `_run_agent_sync` into the async generator
before worker spawn (shown in §1). TTFE is now serialization + one socket
write; payload (`threadId`/`runId`) unchanged.

---

## 4. L4 — Per-profile `SessionDB` reuse

**Status: ⏳ pending.**
**Files:** `hermes_cli/marko_session.py`, call sites in `agui_endpoint.py`
(agent run + title-upgrade thread).

```python
_POOL: dict[str, SessionDB] = {}
_POOL_LOCK = threading.Lock()

def shared_session_db(profile: Optional[str]) -> SessionDB:
    key = profile or "__default__"
    with _POOL_LOCK:
        db = _POOL.get(key)
        if db is None or db._conn is None:
            db = open_session_db(profile)
            _POOL[key] = db
        return db

def invalidate_session_db(profile: Optional[str]) -> None:
    with _POOL_LOCK:
        db = _POOL.pop(profile or "__default__", None)
    if db:
        try: db.close()
        except Exception: pass
```

- `SessionDB` is documented thread-safe ("multiple reader threads, single
  writer", `hermes_state.py:941–946`; internal `self._lock`,
  `check_same_thread=False`).
- `agui_endpoint`: replace `db = open_session_db(profile)` + `finally:
  db.close()` with `db = shared_session_db(profile)` and **no close**.
  Title-upgrade thread (:565–589) likewise drops its private open/close.
- On `sqlite3.DatabaseError` from a pooled handle: `invalidate_session_db`
  then retry once (covers the malformed-schema auto-repair path, which
  requires a fresh connect).

Savings: connect + `apply_wal_with_fallback` + `_init_schema` DDL probe per
request (~2–10 ms) and the same again in the title thread.

---

## 5. C3 — uvloop + httptools

**Status: ⏳ pending.**
**File:** `hermes/pyproject.toml` — add to the web/dashboard dependency set:

```
uvloop>=0.19 ; platform_system != "Windows"
httptools>=0.6
```

uvicorn `Config(loop="auto", http="auto")` picks both up when importable —
zero code change. Update the lazy-install hint at `web_server.py:117` to
`'uvicorn[standard]'`. Verification: startup log line + `python -c "import uvloop"`.

---

## 6. C4 — Cooperative cancellation checkpoints

**Status: ⏳ pending.**
**Files:** `agui_endpoint.py`, `run_agent.py`, `agent/conversation_loop.py`.

- Plumb `should_cancel: Callable[[], bool]` into `AIAgent.__init__`
  (default `lambda: False`); harness passes `cancel.is_set`.
- Checkpoints in `conversation_loop`: (a) before each LLM request,
  (b) inside the stream-consumption loop (per chunk), (c) before each tool
  execution. On true → raise `RunCancelled(RuntimeError)`.
- `_run_agent_sync` catches `RunCancelled` → emits
  `RUN_ERROR {code:"cancelled"}` (already the wire shape at :456).

Effect: disconnected runs stop consuming provider tokens and CPU within one
chunk/tool boundary instead of running to completion.

---

## 7. SQLite — enterprise durability (all state stays in SQLite)

Existing hardening (keep, no changes): WAL with non-WAL-filesystem fallback
(`apply_wal_with_fallback`, `hermes_state.py:364`), jittered app-level write
retries (15×, 20–150 ms, :949–960), `BEGIN IMMEDIATE` +
`isolation_level=None`, passive checkpoint / 50 writes, FTS5 optimize /
1000 writes, malformed-schema backup-then-repair, read-only URI attach for
cross-profile reads, per-profile DB sharding.

### D2 — `synchronous=NORMAL` under WAL

**Status: ✅ shipped** (`0e72d22`) — `_apply_wal_synchronous_normal()` in
`hermes_state.py`, called from both WAL branches of
`apply_wal_with_fallback` (already-WAL probe and fresh `journal_mode=WAL`).
Verified on a live connection: `journal_mode=wal`, `synchronous=1`.

WAL+NORMAL is corruption-safe; loses at most the final transactions on
power cut (acceptable for chat state). Cuts one fsync per commit → one per
checkpoint. `FULL` is kept on the DELETE-journal fallback (rollback journal
needs it). macOS `checkpoint_fullfsync=1` still applies at checkpoint time —
unchanged.

### D1 — Scheduled online backups

**Status: ⏳ pending.**
**New file:** `hermes_cli/db_maintenance.py`

```python
BACKUP_KEEP = int(os.getenv("HERMES_DB_BACKUP_KEEP", "7"))
BACKUP_INTERVAL_S = int(os.getenv("HERMES_DB_BACKUP_INTERVAL_S", "86400"))

def backup_db(db_path: Path) -> Path:
    dest_dir = db_path.parent / "backups"; dest_dir.mkdir(exist_ok=True)
    dest = dest_dir / f"state-{time.strftime('%Y%m%d%H%M%S')}.db"
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        con.execute("VACUUM INTO ?", (str(dest),))   # atomic, live-safe (SQLite ≥ 3.27)
    finally:
        con.close()
    prune_oldest(dest_dir, keep=BACKUP_KEEP)
    return dest

def quick_check(db_path: Path) -> bool:
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    try:
        return con.execute("PRAGMA quick_check").fetchone()[0] == "ok"
    finally:
        con.close()

def maintenance_loop(stop: threading.Event) -> None:
    stop.wait(60)                                   # settle after boot
    while not stop.is_set():
        for db_path in discover_profile_dbs():      # ~/.hermes/profiles/*/state.db
            try:
                if not quick_check(db_path):
                    log.error("quick_check FAILED: %s", db_path)
                backup_db(db_path)
            except Exception:
                log.exception("db maintenance failed: %s", db_path)
        stop.wait(BACKUP_INTERVAL_S)
```

**Wire-up:** `_lifespan` starts `threading.Thread(target=maintenance_loop,
daemon=True)` with a `stop` event set in the `finally` block (same pattern
as the desktop cron ticker, `web_server.py:205–226`).

CPU cost: `VACUUM INTO` of a chat-scale DB is sub-second, once per day.

### D3 — Startup integrity probe

**Status: ⏳ pending.**
Inside `_warm_agent_stack` (§3) or a sibling warm task: run
`quick_check(active_profile_db)` once, log `ERROR` on failure. Never blocks
the event loop (executor thread).

### Accepted limit

Single-node; no hot failover. Escape hatch if ever needed: Litestream
(continuous WAL → S3, point-in-time restore) or LiteFS — both keep the
SQLite API, no schema work.

---

## 8. Static serving

### S1 — Immutable cache for hashed assets

**Status: ✅ shipped** (`a603d9f`) — `_HashedStaticFiles` in
`web_server.py` `mount_spa()`. Verified:
`curl -I /_next/static/chunks/<hash>.js` →
`cache-control: public, max-age=31536000, immutable`.

```python
class _HashedStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        resp = await super().get_response(path, scope)
        if resp.status_code == 200 and path.startswith("static/"):
            resp.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return resp

application.mount("/_next", _HashedStaticFiles(directory=_next_dir), name="next_static")
```

`/_next/static/**` filenames are content-hashed by Next → immutable is
correct; everything else keeps the default validate-on-request behavior.
Repeat page loads: N conditional GETs → 0 requests.

### S2 — Build-time precompression

**Status: ⏳ pending.**
**File:** `ui/scripts/copy-web-dist.mjs`: after copy, for every
`{js,css,svg,json,txt,html}` ≥ 1 KB emit `f.br`
(`zlib.brotliCompressSync`, quality 10) and `f.gz` (level 9).
**Server:** in `_HashedStaticFiles.get_response`, if
`Accept-Encoding` contains `br`/`gzip` and `<path>.br|.gz` exists, serve it
with `Content-Encoding`, original `Content-Type`, `Vary: Accept-Encoding`.
Compression cost moves to build time; runtime CPU for static ≈ sendfile.

### S3 — Visibility-gated client polling

**Status: ✅ shipped** (`343897e`).

- `StatusFooter.tsx` — `/api/health` polls skip hidden tabs and refresh
  immediately on `visibilitychange`.
- `useNow.ts` — the shared elapsed-time ticker pauses its interval entirely
  while hidden and resyncs on return (covers `ThinkingBlock`,
  `StageStrip`).
- React Query intervals (`WorkspacePanel`, `BriefingPanel`, `McpSubPanel`,
  `CoworkWorkRequests`): `refetchIntervalInBackground` left unset (defaults
  `false`) — already correct, no change.

---

## 9. Launch script (`scripts/start-hermes-ui.sh`)

### T1 — Content-hash build stamp

**Status: ✅ shipped** (`a59de34`). Warm start measured 1.4–1.6 s;
`--force-build` bypasses the stamp. The stamp lives in
`web_dist/.build-stamp` and is rewritten after every successful build
(`copy-web-dist.mjs` wipes `web_dist`, so a failed build can never leave a
stale stamp).

```bash
STAMP_FILE="$ROOT/hermes/hermes_cli/web_dist/.build-stamp"
build_hash() {
  find "$ROOT/ui/src" "$ROOT/ui/app" "$ROOT/packages/shared/src" \
       "$ROOT/ui/package.json" "$ROOT/ui/next.config.ts" \
       -type f -print0 2>/dev/null | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1
}
if [[ "$SKIP_BUILD" -eq 0 ]]; then
  want="$(build_hash)"
  have="$(cat "$STAMP_FILE" 2>/dev/null || true)"
  if [[ "$want" == "$have" && -f "$ROOT/hermes/hermes_cli/web_dist/index.html" ]]; then
    echo "UI unchanged (stamp $want) — skipping build"
  else
    (cd "$ROOT" && npm run build:ui) && printf '%s' "$want" > "$STAMP_FILE"
  fi
fi
```

Add `--force-build` to bypass the stamp. Default path becomes both safe
(no stale dist) and fast (no rebuild when sources unchanged).

### T2 — Tight wait loops

**Status: ✅ shipped** (`a59de34`).

- Health poll: `sleep 1` → `sleep 0.25`, iterations 45 → 180 (same 45 s cap).
- Replace `sleep 0.5` / `sleep 0.3` after `fuser -k` / `C-c` with:

```bash
for _ in $(seq 1 40); do ss -ltn 2>/dev/null | grep -q ':9119 ' || break; sleep 0.05; done
```

### T3 — Incremental dist copy

**Status: ⏳ pending.**
`copy-web-dist.mjs`: replace `rmSync` + `cpSync` with a sync walk — copy on
size/mtime mismatch, delete extraneous files afterwards (never serve a
half-deleted dist; `.build-stamp` exempt from deletion).

### T4 — Bytecode precompile (env setup)

**Status: ⏳ pending.**
`python3 -m compileall -q hermes/hermes_cli hermes/agent hermes/tools hermes/run_agent.py`
— keeps cold import near the warm 0.46 s + 0.61 s numbers.

---

## 10. L5 (deferred) — `AIAgent` init caching

Precondition: profile first. `cProfile` around `AIAgent(...)` ctor
(`agui_endpoint.py:423–451`) under a real request; attribute time across
`agent/agent_init.py` (config parse, toolset registration, prompt assembly).
Cache only pieces proven stateless, keyed `(profile, platform)`, invalidated
on `config.yaml` mtime. Do not implement before L1/C1/L2 land — those may
already put harness TTFT under the 20 ms gate.

---

## 11. Verification protocol & recorded results

1. **Timing** — `scripts/smoke_agui.py` now prints TTFE/TTFT/event
   count/wall per run (`--runs N` aggregates min/median/max).
   **Result:** TTFE min 2.3 / median ~4 / max 7.7 ms across 20+ runs
   (no-LLM env; runs terminate at `RUN_ERROR` so TTFT requires a
   configured provider).
2. **CPU:** `pidstat -u -p <pid> 1 30` during a long streamed reply —
   compare cumulative CPU-seconds. *(Requires an LLM provider; pending.)*
3. **Event count** — gate ≤ tokens/10.
   **Result:** test-verified — 400 synthetic 1-char deltas produced far
   fewer `TEXT_MESSAGE_CONTENT` events with zero token loss and correct
   flush-before-`TOOL_CALL_START` ordering
   (`test_agui_deltas_coalesce_and_flush_before_structural_events`).
4. **Idle** — gate 0 bridge wakeups.
   **Result:** structural — the consumer is `await aq.get()`; there is no
   polling path left to wake.
5. **Soak** — gate RSS < 150 MB, no leaks.
   **Result:** 20 sequential runs: RSS 135.4 → 136.5 MB, threads 6 → 6.
   (5-concurrent-stream soak still to run with a live provider.)
6. **Durability drill.**
   **Result:** `kill -9` mid-operation → restart → `PRAGMA quick_check` =
   `ok`, 24 sessions intact, server healthy in 1.4 s. (Snapshot restore
   pending D1.)
7. **Static.**
   **Result:** hashed chunk served with
   `cache-control: public, max-age=31536000, immutable`. (`br` pending S2.)
8. **Script.**
   **Result:** warm-stamp start 1.4–1.6 s (`Marko UI unchanged (stamp …) —
   skipping build`); full rebuild path 27.6 s when sources change.

## 12. Sequencing & risk

| Order | Items | Files touched | Risk | Status |
|---|---|---|---|---|
| 1 | L1, C1 | `agui_endpoint.py` | Low — single file, ordering invariants unit-testable | ✅ shipped |
| 2 | L2, L3, T1, T2, D2 | `web_server.py`, `hermes_state.py`, `start-hermes-ui.sh` | Low | ✅ shipped |
| 3 | C3, S1, L4, D1, D3 | `pyproject.toml`, `web_server.py`, `marko_session.py`, `db_maintenance.py` (new) | Low–moderate (L4: pooled handle lifecycle) | S1 ✅; rest pending |
| 4 | C2, C4, S2, S3, T3, T4 | UI renderer, `conversation_loop.py`, `copy-web-dist.mjs` | Moderate (C4 touches the conversation loop) | ⏳ pending |
| 5 | L5 | `run_agent.py`, `agent_init.py` | Highest — profile-gated, last | ⏳ deferred |
