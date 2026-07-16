#!/usr/bin/env python3
"""Smoke-test AionUi WebUI + Hermes ACP detection."""
from __future__ import annotations

import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get("AIONUI_BASE_URL", "http://127.0.0.1:25808").rstrip("/")


def get(path: str) -> dict:
    req = urllib.request.Request(f"{BASE}{path}", headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def main() -> int:
    errors: list[str] = []

    # UI shell
    try:
        with urllib.request.urlopen(f"{BASE}/", timeout=10) as resp:
            if resp.status not in (200, 302, 307, 401):
                errors.append(f"UI HTTP {resp.status}")
    except urllib.error.URLError as exc:
        errors.append(f"UI unreachable: {exc}")
        print("FAIL:", "; ".join(errors))
        return 1

    # System info
    info = get("/api/system/info")
    if not info.get("success"):
        errors.append("system/info failed")

    # Assistants must include Hermes (builtin ACP)
    assistants = get("/api/assistants")
    hermes_asst = None
    for a in assistants.get("data") or []:
        agent = a.get("agent") or {}
        if agent.get("acp_backend") == "hermes" or (a.get("name") or "").lower() == "hermes":
            hermes_asst = a
            break
    if not hermes_asst:
        errors.append("Hermes missing from /api/assistants")
    elif hermes_asst.get("enabled") is False:
        errors.append("Hermes assistant is disabled")

    # Management entry must be installed with hermes acp args
    mgmt = get("/api/agents/management")
    hermes_agent = None
    for a in mgmt.get("data") or []:
        info_src = a.get("agent_source_info") or {}
        if a.get("backend") == "hermes" or info_src.get("binary_name") == "hermes":
            hermes_agent = a
            break
    if not hermes_agent:
        errors.append("Hermes missing from /api/agents/management")
    else:
        args = hermes_agent.get("args") or []
        if "acp" not in args:
            errors.append(f"Hermes args missing acp: {args!r}")
        if not hermes_agent.get("installed", True):
            errors.append("Hermes marked not installed")
        cmd = hermes_agent.get("command") or ""
        print(f"Hermes command: {cmd} {args}")
        print(f"Hermes status:  {hermes_agent.get('status')}")
        err = hermes_agent.get("last_check_error_message") or ""
        if err:
            print(f"Last check:     {err}")

    require_online = os.environ.get("AIONUI_SMOKE_REQUIRE_ONLINE", "1") == "1"
    if hermes_agent and require_online and hermes_agent.get("status") != "online":
        errors.append(
            f"Hermes status is {hermes_agent.get('status')!r}, expected online "
            f"({hermes_agent.get('last_check_error_message') or 'no error message'})"
        )

    # Chat readiness (ACP online ≠ LLM ready)
    try:
        import subprocess

        chk = subprocess.run(
            [
                sys.executable,
                "-c",
                "import sys; sys.path.insert(0,'hermes'); "
                "from acp_adapter.auth import has_provider; "
                "sys.exit(0 if has_provider() else 1)",
            ],
            cwd=os.environ.get("AIONUI_REPO_ROOT")
            or os.path.abspath(os.path.join(os.path.dirname(__file__), "..")),
            env={**os.environ, "PYTHONPATH": "hermes"},
            check=False,
        )
        if chk.returncode != 0:
            print(
                "WARN: Hermes ACP is online but no LLM provider is configured — "
                "chat will show USER_AGENT_AUTH_REQUIRED. "
                "Run: export OPENROUTER_API_KEY=... && bash scripts/configure-hermes-provider.sh"
            )
            if os.environ.get("AIONUI_SMOKE_REQUIRE_PROVIDER", "0") == "1":
                errors.append("Hermes has no LLM provider (chat blocked)")
        else:
            print("Hermes provider: ready")
    except Exception as exc:
        print(f"WARN: provider check failed: {exc}")

    if errors:
        print("FAIL:")
        for e in errors:
            print(" -", e)
        return 1

    print("OK: AionUi UI up; Hermes assistant + ACP agent online")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
