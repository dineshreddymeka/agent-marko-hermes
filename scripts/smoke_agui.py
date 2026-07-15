#!/usr/bin/env python3
"""Smoke: POST /agui against a running Hermes (loopback).

Prints latency metrics per run:
  TTFE  — POST sent → first SSE data line (should be RUN_STARTED)
  TTFT  — POST sent → first TEXT_MESSAGE_CONTENT delta
  events, wall time, and the first few event types.

Usage: smoke_agui.py [BASE_URL] [--runs N] [--quiet]
"""

from __future__ import annotations

import json
import sys
import time
import urllib.error
import urllib.request

args = [a for a in sys.argv[1:] if not a.startswith("--")]
BASE = args[0] if args else "http://127.0.0.1:9119"
RUNS = 1
QUIET = "--quiet" in sys.argv
for i, a in enumerate(sys.argv):
    if a == "--runs" and i + 1 < len(sys.argv):
        RUNS = int(sys.argv[i + 1])


def one_run(token: str | None, run_idx: int) -> dict:
    headers = {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    if token:
        headers["X-Hermes-Session-Token"] = token

    payload = {
        "threadId": f"smoke-thread-{run_idx}",
        "runId": f"smoke-run-{run_idx}-{int(time.time())}",
        "messages": [{"id": "1", "role": "user", "content": "Say hi in one short sentence."}],
    }
    req = urllib.request.Request(
        f"{BASE}/agui",
        data=json.dumps(payload).encode(),
        headers=headers,
        method="POST",
    )
    t0 = time.perf_counter()
    ttfe = ttft = None
    n_events = 0
    n_text = 0
    types: list[str] = []
    finished = False
    with urllib.request.urlopen(req, timeout=180) as resp:
        for raw in resp:
            line = raw.decode("utf-8", errors="replace").rstrip("\n")
            if not line.startswith("data:"):
                continue
            now = time.perf_counter()
            n_events += 1
            if ttfe is None:
                ttfe = now - t0
            try:
                etype = json.loads(line[5:]).get("type", "?")
            except Exception:
                etype = "?"
            if len(types) < 10:
                types.append(etype)
            if etype == "TEXT_MESSAGE_CONTENT":
                n_text += 1
                if ttft is None:
                    ttft = now - t0
            if etype in ("RUN_FINISHED", "RUN_ERROR"):
                finished = etype == "RUN_FINISHED"
                break
    wall = time.perf_counter() - t0
    return {
        "ttfe_ms": None if ttfe is None else round(ttfe * 1000, 1),
        "ttft_ms": None if ttft is None else round(ttft * 1000, 1),
        "events": n_events,
        "text_events": n_text,
        "wall_s": round(wall, 2),
        "finished": finished,
        "types": types,
    }


def main() -> int:
    boot = urllib.request.urlopen(f"{BASE}/api/marko/boot", timeout=5)
    boot_body = json.loads(boot.read().decode())
    token = boot_body.get("token")
    if not token and not boot_body.get("authRequired"):
        print("boot ok but no token", boot_body)
        return 1

    results = []
    for i in range(RUNS):
        try:
            r = one_run(token, i)
        except urllib.error.HTTPError as e:
            print("HTTP", e.code, e.read()[:500])
            return 1
        except Exception as e:
            print("error:", e)
            return 1
        results.append(r)
        if not QUIET:
            print(
                f"run {i + 1}/{RUNS}: TTFE {r['ttfe_ms']} ms  TTFT {r['ttft_ms']} ms  "
                f"events {r['events']} (text {r['text_events']})  wall {r['wall_s']} s  "
                f"finished={r['finished']}"
            )
            print("  first events:", " ".join(r["types"]))

    ok = all(r["events"] > 0 for r in results)
    if RUNS > 1 and ok:
        ttfes = [r["ttfe_ms"] for r in results if r["ttfe_ms"] is not None]
        ttfts = [r["ttft_ms"] for r in results if r["ttft_ms"] is not None]
        if ttfes:
            print(f"TTFE ms — min {min(ttfes)}  median {sorted(ttfes)[len(ttfes)//2]}  max {max(ttfes)}")
        if ttfts:
            print(f"TTFT ms — min {min(ttfts)}  median {sorted(ttfts)[len(ttfts)//2]}  max {max(ttfts)}")
    print("ok" if ok else "FAIL: no SSE events")
    return 0 if ok else 2


if __name__ == "__main__":
    raise SystemExit(main())
