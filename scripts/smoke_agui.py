#!/usr/bin/env python3
"""Smoke: POST /agui against a running Hermes (loopback) and print first SSE events."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:9119"


def main() -> int:
    boot = urllib.request.urlopen(f"{BASE}/api/marko/boot", timeout=5)
    boot_body = json.loads(boot.read().decode())
    token = boot_body.get("token")
    if not token and not boot_body.get("authRequired"):
        print("boot ok but no token", boot_body)
        return 1
    headers = {
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }
    if token:
        headers["X-Hermes-Session-Token"] = token

    payload = {
        "threadId": "smoke-thread",
        "runId": "smoke-run",
        "messages": [{"id": "1", "role": "user", "content": "Say hi in one short sentence."}],
    }
    req = urllib.request.Request(
        f"{BASE}/agui",
        data=json.dumps(payload).encode(),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            print("status", resp.status, resp.headers.get("Content-Type"))
            n = 0
            for raw in resp:
                line = raw.decode("utf-8", errors="replace").rstrip("\n")
                if line.startswith("data:"):
                    print(line[:240])
                    n += 1
                    if n >= 8:
                        break
            print("ok: received", n, "SSE data lines")
            return 0 if n else 2
    except urllib.error.HTTPError as e:
        print("HTTP", e.code, e.read()[:500])
        return 1
    except Exception as e:
        print("error:", e)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
