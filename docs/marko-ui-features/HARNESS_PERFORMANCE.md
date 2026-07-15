# Agentic Harness Performance Plan — Ultrafast, Ultralow Latency, Low CPU

Optimization plan for the **agentic harness**: the one-hop run path
`POST /agui` → SSE stream → worker thread → `AIAgent.run_conversation()`,
plus the server/startup scaffolding around it. Every recommendation below is
grounded in measurements taken on this repo (Linux, CPython 3.x, warm page
cache).

---

## 1. Measured baseline

### 1.1 Memory (framework floor → live process)

| Layer | RSS |
|---|---|
| Bare CPython interpreter | 11 MB |
| + FastAPI (pydantic is the bulk) | 39 MB |
| + uvicorn + starlette | 42 MB |
| After `import hermes_cli.web_server` (17.8k lines) | 57 MB |
| After `import run_agent` (full agent stack, ~87k lines under `agent/`) | 69 MB |
| Live `hermes dashboard` steady state | **91 MB, 4 threads** |

### 1.2 CPU and time

| Metric | Value |
|---|---|
| Idle CPU (steady state, sampled with `top`) | **0.0%** |
| `import hermes_cli.web_server` (warm) | 0.46 s |
| `import run_agent` → `AIAgent` (warm, first `/agui` run pays this) | 0.61 s |
| `uvloop` / `httptools` installed | **No** (pure-Python asyncio + h11) |
| uvicorn log level | `warning` (access log already off) |

### 1.3 Runtime shape (facts that drive the plan)

- **UI at runtime is free.** Hermes serves the 18 MB static Next export
  (`hermes_cli/web_dist`) from FastAPI. There is no Node process at runtime;
  `next dev` (~0.5–1.5 GB RSS + watchers) is dev-only and the harness kills it.
- **One worker thread per run** (`_run_agent_sync`), bridged to the SSE
  generator through a `queue.Queue` polled with
  `asyncio.to_thread(out_q.get, True, 0.25)` — 4 wakeups/sec per active
  stream plus one threadpool round-trip **per event**.
- **Fresh everything per run**: `AIAgent` constructed per request,
  `open_session_db(profile)` per request, agent stack imported lazily on the
  first run.
- **One SSE event per LLM token** (`TEXT_MESSAGE_CONTENT` delta per
  `stream_delta_callback` call); the client re-renders markdown per delta.
- **No polling loops in the server** (cron ticker wakes every 60 s; OAuth
  device polls only run during an active login). Client React Query
  refetch intervals are 4–60 s and mostly conditional.
- Startup script does a full `next build` unless `--skip-build`, health-polls
  at 1 s intervals (up to 45 s), and has fixed `sleep 0.5` / `sleep 0.3`.

### 1.4 Latency budget (targets)

| Metric | Today (estimated) | Target |
|---|---|---|
| TTFE — request → `RUN_STARTED` on the wire | ~5–50 ms (thread spawn + queue bridge) | **< 2 ms** |
| TTFT — request → first `TEXT_MESSAGE_CONTENT` (excluding LLM) | first run +0.6 s import; then agent init + DB open | **< 20 ms harness overhead, every run** |
| Inter-event overhead | threadpool hop per event | **< 0.1 ms (direct loop wakeup)** |
| Cold start: script → UI serving | build (minutes) or ~3–8 s with `--skip-build` | **< 2 s with warm dist** |

---

## 2. Run-path latency (`hermes_cli/agui_endpoint.py`)

### P0 — L1: Replace the polled queue bridge with a loop-native handoff

`_event_stream` currently does `await asyncio.to_thread(out_q.get, True, 0.25)`
in a loop. Each event pays a threadpool dispatch; each idle quarter-second
pays a futile wakeup; disconnects are noticed up to 250 ms late.

Change: keep the worker thread, but hand events to the event loop directly:

```python
# in agui_run (async context): capture the running loop
loop = asyncio.get_running_loop()
aq: asyncio.Queue = asyncio.Queue()

def emit(event):            # called from the worker thread
    loop.call_soon_threadsafe(aq.put_nowait, event)
```

The SSE generator becomes `event = await aq.get()` — zero polling, sub-µs
handoff, instant wakeup per event. Detect disconnect via
`request.is_disconnected()` checked on a lightweight side task, or rely on
the `finally` block (uvicorn cancels the generator when the client goes
away) to set `cancel`.

- Files: `hermes_cli/agui_endpoint.py` (`_event_stream`, `_run_agent_sync`
  signature: pass an `emit` callable instead of `out_q`).
- Wins: removes 4 wakeups/s per stream, removes a threadpool hop per token,
  disconnect handling becomes immediate.
- Risk: low; the worker thread never touches asyncio directly
  (`call_soon_threadsafe` is the documented thread-safe entry point).

### P0 — L2: Preload the agent stack at server startup

The first `/agui` run pays `import run_agent` (0.61 s warm, worse cold).
Kick a daemon thread at FastAPI startup that imports `run_agent`,
`tools.a2ui_render_tool`, `agent.title_generator`, and
`hermes_cli.marko_session`. Imports are cached process-wide, so the first
user turn skips them.

- Files: `hermes_cli/web_server.py` (startup hook), no API changes.
- Wins: first-token latency on run #1 drops by ~0.6–2 s.
- Risk: none beyond +12 MB RSS arriving earlier (it arrives anyway).

### P1 — L3: Emit `RUN_STARTED` before spawning the worker

`RUN_STARTED` is data-independent. Yield it from the async generator
immediately, then start the thread. The UI shows the working shimmer at
TTFE ≈ network RTT instead of waiting for thread spawn + first bridge hop.

- Files: `agui_endpoint.py` (`_event_stream` yields it; remove from
  `_run_agent_sync`).

### P1 — L4: Reuse per-profile session DB handles

`open_session_db(profile)` runs per request (plus a second one in the title
upgrade thread). Keep a small per-profile pool (dict + lock; SQLite with
`check_same_thread=False` or one handle per worker), with WAL +
`synchronous=NORMAL` pragmas set once.

- Files: `hermes_cli/marko_session.py`, call sites in `agui_endpoint.py`.
- Wins: a few ms per run; removes repeated pragma/schema checks.
- Risk: moderate — SQLite thread-affinity; keep it a handle-per-thread pool,
  not a shared connection.

### P2 — L5: Cache heavy `AIAgent` init per (profile, platform)

`AIAgent` construction re-reads config, re-registers toolsets, and
re-assembles the static parts of the system prompt on every run. Profile
`agent_init.py` (2.1k lines) under a real run; cache the pure/static pieces
(parsed config, tool registry, prompt segments) keyed by
`(profile, platform)` with mtime invalidation on config.yaml, keeping the
per-run object thin.

- Files: `run_agent.py`, `agent/agent_init.py`.
- Wins: unknown until profiled — measure first (see §6); likely tens of ms.
- Risk: highest of the list — shared mutable state across runs; do it last
  and only for pieces proven expensive and proven stateless.

---

## 3. CPU during streaming

### P0 — C1: Coalesce token deltas into ~16 ms frames

One SSE event per token means: JSON-dump + SSE write + client parse +
markdown re-render, per token. Batch deltas in the worker with a flush
window (~16–33 ms or N tokens, whichever first):

```python
# emit path: append to buf; flush when 16 ms elapsed or buf > 512 chars
emit({"type": "TEXT_MESSAGE_CONTENT", "messageId": mid, "delta": "".join(buf)})
```

Below one display frame, so perceived streaming is identical, but event
count drops ~10×. This is the single biggest CPU cut on **both** sides
(server serialization + browser re-render). Apply the same to
`THINKING_TEXT_MESSAGE_CONTENT`.

- Files: `agui_endpoint.py` (`on_stream_delta` / `on_reasoning_delta`).
- Invariant: always flush before `TEXT_MESSAGE_END`, tool events, and
  `RUN_FINISHED` so ordering is preserved.

### P1 — C2: Defer expensive rendering to message end (UI)

During streaming, render deltas as plain text/light markdown; run shiki
syntax highlighting, mermaid, and KaTeX only on `TEXT_MESSAGE_END` (or when
a fenced block closes). These three are the heaviest CPU users in the
client bundle and re-running them per delta is wasted work.

- Files: `ui/src/components/chat/*` (markdown renderer), gate on
  `isStreaming`.

### P1 — C3: Install `uvicorn[standard]` (uvloop + httptools)

Currently running pure-Python asyncio + h11. uvloop cuts event-loop
overhead ~2–4× and httptools speeds header parsing; both matter for
long-lived SSE writes and static file serving.

- Files: `hermes/pyproject.toml` extras + the lazy-install hint in
  `web_server.py` (line ~117). uvicorn picks both up automatically when
  importable.
- Risk: low; pure drop-in on Linux.

### P2 — C4: True cancellation checkpoints in the conversation loop

After a client disconnect the worker thread keeps running (and burning LLM
tokens + CPU) until its next checkpoint. Thread the existing `cancel`
event into `AIAgent` callbacks — check it in `stream_delta_callback` and
before each tool execution, raising a `CancelledRun` exception to unwind.

- Files: `agui_endpoint.py`, `agent/conversation_loop.py`.
- Wins: CPU + token spend on abandoned runs; no latency effect.

---

## 4. Static serving and client load

### P1 — S1: Immutable caching for hashed assets

`/_next/static/*` files are content-hashed; serve them with
`Cache-Control: public, max-age=31536000, immutable`. Today the
`StaticFiles` mount forces a revalidation round-trip per asset per load.
Wrap the mount or add middleware keyed on the `/_next/` prefix.

- Files: `web_server.py` `mount_spa()` (lines ~16266–16271).
- Wins: repeat page loads go from N conditional GETs to zero requests.

### P2 — S2: Precompress at build time

Emit `.br`/`.gz` next to assets in `copy-web-dist.mjs`; serve them via a
small `FileResponse` wrapper honoring `Accept-Encoding`. Cuts transfer
~70% and does the compression once at build instead of never (uvicorn does
not compress by default) or per-request (GZipMiddleware).

### P2 — S3: Pause client polling when hidden

The React Query refetch intervals (4–60 s in `WorkspacePanel`,
`BriefingPanel`, `CoworkWorkRequests`, `StatusFooter`) should not fire in
background tabs. React Query's `refetchIntervalInBackground` already
defaults to `false` — verify, and add a `document.visibilitychange` gate to
the raw `setInterval` in `StatusFooter.tsx` (15 s tick).

---

## 5. Startup (harness script + build)

### P0 — T1: Content-hash build stamp

`scripts/start-hermes-ui.sh` runs a full `next build` unless
`--skip-build`. Reuse the stamp pattern already in `main.py` for the
desktop build: hash `ui/src`, `ui/app`, `packages/shared/src`,
`ui/package.json`, `ui/next.config.ts`; skip the build when the stamp
matches `web_dist/.build-stamp`. Makes the default path both safe *and*
fast — no stale-dist risk, no needless minutes-long rebuild.

### P1 — T2: Tighten the wait loops

- Health poll: 250 ms interval instead of 1 s (`curl --connect-timeout 1`
  stays); readiness is detected up to 750 ms sooner.
- Replace `sleep 0.5` / `sleep 0.3` after `fuser -k` with a loop that
  checks the port is actually free (`ss -ltn`), typically exiting in
  < 50 ms.

### P2 — T3: Incremental dist copy

`copy-web-dist.mjs` does `rmSync` + `cpSync` of 18 MB every build. Copy
incrementally (compare size+mtime, delete extraneous) so unchanged builds
touch nothing and Hermes never serves a half-deleted dist during the copy
window.

### P2 — T4: Precompile bytecode in setup

`python -m compileall hermes_cli agent tools run_agent.py` during env
setup keeps cold-start import time close to the warm 0.46 s + 0.61 s
measured above.

---

## 6. Memory posture

91 MB steady state with a 42 MB framework floor is already lean; no
rewrite is warranted (dropping FastAPI/pydantic for raw starlette would
save ~25 MB at enormous churn — rejected). Guardrails instead:

- The per-run worker, title-upgrade thread, and their captured
  closures (history lists, `emitted_a2ui`) must be released at run end —
  verify with a 50-run soak that RSS plateaus.
- L2 preloading moves the +12 MB agent stack to startup; expected steady
  state ≈ 100 MB. Budget cap: **150 MB** RSS under 5 concurrent streams.

---

## 7. SQLite at enterprise level (all state in SQLite — by design)

All persistent state (sessions, messages, titles, A2UI surfaces, FTS search)
lives in per-profile SQLite databases (`~/.hermes/profiles/<p>/state.db`).
This is the right architecture for a single-node harness, and the existing
`SessionDB` layer (`hermes_state.py`) is already production-hardened:

| Already implemented | Where |
|---|---|
| WAL journal mode with rollback-journal fallback on non-WAL filesystems | `apply_wal_with_fallback` |
| App-level write retry with random jitter (15×, 20–150 ms) to avoid busy-handler convoys across processes | `SessionDB._WRITE_*` |
| Explicit `BEGIN IMMEDIATE` transactions (`isolation_level=None`), `foreign_keys=ON` | `SessionDB.__init__` |
| Passive WAL checkpoint every 50 writes; FTS5 segment merge every 1000 writes | `_CHECKPOINT_EVERY_N_WRITES`, `_OPTIMIZE_EVERY_N_WRITES` |
| Malformed-schema detection + automatic backup-then-repair of `sqlite_master` | `repair_state_db_schema` |
| Read-only URI connections for cross-profile reads (no write locks from sidebar polling) | `SessionDB(read_only=True)` |
| Natural sharding: one DB per profile | `marko_session.open_session_db` |

**Capacity reality check:** the chat workload writes kilobyte-scale rows at
human message rates. WAL SQLite sustains thousands of write TPS on one node;
the harness will hit LLM-provider limits long before SQLite limits. WAL's
single-writer serialization is a non-issue at this rate, and readers never
block.

### Gaps to close for enterprise posture

- **P0 — D1: Scheduled online backups.** Nothing backs up `state.db` today.
  Add either a cron `VACUUM INTO '<backup-path>'` snapshot (atomic, works on
  a live DB) or [Litestream](https://litestream.io/) for continuous WAL
  replication to S3-compatible storage with point-in-time recovery.
- **P1 — D2: Set `synchronous=NORMAL` under WAL.** Confirmed absent —
  connections run at the default `FULL` (an fsync per commit).
  `NORMAL` in WAL mode is corruption-safe and fsyncs once per checkpoint
  instead, cutting per-write latency; worst case on power loss is the last
  few committed transactions, which for chat state is acceptable. Add it in
  `apply_wal_with_fallback` (only when WAL actually engaged — keep `FULL`
  on the DELETE-journal fallback path).
- **P1 — D3: Proactive integrity checks.** Run `PRAGMA quick_check` at
  startup and on a daily cron tick, logging failures loudly — today
  corruption is only discovered when it trips the repair path.
- **Known limit (accepted):** no hot failover — SQLite is single-node. If
  multi-server HA is ever required, replicate with LiteFS or move shared
  tables to a server DB. For the single-box deployment this harness
  targets, this does not apply.

The §2 L4 item (per-profile handle reuse) aligns with this: `SessionDB` is
documented as thread-safe for "multiple reader threads, single writer" — it
is designed to be held open per profile, not reopened per request.

## 8. Verification

1. **Harness timing**: extend `scripts/smoke_agui.py` to print TTFE, TTFT,
   total events, and wall time per run. Run before/after each P0.
2. **CPU**: `pidstat -p <hermes-pid> 1` during a long streaming reply;
   compare cumulative CPU seconds before/after C1 (+L1). Expect ≥ 5× fewer
   events and visibly lower busy time.
3. **Client**: Chrome performance trace during streaming; scripting time
   per second should drop sharply after C1 + C2.
4. **Soak**: 50 sequential runs + 5 concurrent streams; assert RSS < 150 MB
   and thread count returns to baseline.
5. **Startup**: `time bash scripts/start-hermes-ui.sh` with warm stamp;
   target < 2 s to healthy.
6. **Durability drill**: kill -9 the server mid-stream, restart, and assert
   `PRAGMA quick_check` passes and the session history is intact; restore a
   `VACUUM INTO` snapshot and verify sessions load from it.

## 9. Sequencing

| Order | Items | Why first |
|---|---|---|
| 1 | L1, C1 | Biggest latency + CPU wins, one file each, independently testable |
| 2 | L2, L3, T1, T2, D1 | First-run latency + startup + backups, all low-risk |
| 3 | C3, S1, L4, D2, D3 | Drop-in dependency + headers + DB pooling + durability checks |
| 4 | C2, C4, S2, S3, T3, T4 | Client render + cancellation + polish |
| 5 | L5 | Only after profiling proves `AIAgent` init is worth caching |
