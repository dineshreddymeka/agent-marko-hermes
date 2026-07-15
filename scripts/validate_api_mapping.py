#!/usr/bin/env python3
"""Validate docs/marko-ui-features/API_MAPPING.md covers every Marko frontend API path.

Checks:
  1. Every UI `/api/*` and `/agui` call appears in the canonical inventory
     block inside docs/marko-ui-features/API_MAPPING.md (no missing docs).
  2. Inventory entries that claim Hermes is mounted actually exist in
     live OpenAPI when HERMES_URL is reachable (optional, non-fatal warn
     for intentionally missing families).
  3. Stale inventory paths no longer referenced by UI (warn).

Exit codes:
  0 — complete
  1 — missing documentation (UI path not in MD inventory)
  2 — inventory / MD parse error

Usage:
  python3 scripts/validate_api_mapping.py
  python3 scripts/validate_api_mapping.py --hermes http://127.0.0.1:9119
  npm run validate:api-map
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

ROOT = Path(__file__).resolve().parents[1]
MD_PATH = ROOT / "docs" / "marko-ui-features" / "API_MAPPING.md"
UI_SRC = ROOT / "ui" / "src"

INVENTORY_BEGIN = "<!-- BEGIN_API_INVENTORY -->"
INVENTORY_END = "<!-- END_API_INVENTORY -->"

# Dynamic template noise / comments that are not real endpoints.
IGNORE_PATH_SUBSTRINGS = (
    "/api/fs/*",
    "${",
)

# Param name aliases treated as the same slot.
PARAM_RE = re.compile(r"\{[^}/]+\}")
DYNAMIC_RE = re.compile(
    r"""(?:
        \$\{[^}]+\}
      | \{[a-zA-Z_][a-zA-Z0-9_]*\}
    )""",
    re.VERBOSE,
)

# apiClient.METHOD(...); path extracted by scanning forward past generics.
APICLIENT_CALL_RE = re.compile(r"""apiClient\.(get|post|put|patch|delete)\b""")
APICLIENT_PATH_RE = re.compile(r"""(['"`])(/api/[^'"`]*|/agui(?:/[^'"`]*)?)\1""")

# fetch('/api/...') or fetch(`/api/...`)
FETCH_RE = re.compile(
    r"""fetch\s*\(\s*(['"`])(/api/[^'"`]*|/agui(?:/[^'"`]*)?)\1""",
    re.MULTILINE,
)

# fetch with method nearby (best-effort within ~200 chars after)
FETCH_METHOD_RE = re.compile(
    r"""fetch\s*\(\s*(['"`])(/api/[^'"`]*|/agui(?:/[^'"`]*)?)\1[\s\S]{0,220}?method\s*:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]""",
    re.IGNORECASE,
)

# window.location / href assignments
NAV_RE = re.compile(
    r"""(?:location\.assign|href\s*=)\s*\(?\s*(?:`([^`]+)`|['"]([^'"]+)['"])""",
)

# Loose string literals that look like API paths (fallback)
LOOSE_RE = re.compile(r"""['"`](/api/[a-zA-Z0-9_/{}$.-]+|/agui)['"`]""")

METHOD_SPLIT_RE = re.compile(r"\b(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\b", re.I)


def normalize_path(raw: str) -> Optional[str]:
    """Normalize a path template for inventory comparison."""
    path = raw.strip()
    if not path:
        return None
    # Drop query string
    path = path.split("?", 1)[0]
    # Skip junk
    for bad in IGNORE_PATH_SUBSTRINGS:
        if bad in path and bad != "/api/fs/*":
            if "${" in path and "/{" not in path.replace("${", ""):
                # keep templates that only use ${id} — convert below
                pass
        if path == "/api/fs/*":
            return None
    if "${" in path and re.search(r"\$\{[^}]*[\s?:]", path):
        # Ternary / expression junk e.g. ${job.enabled ? 'pause' : 'resume'}
        # Expand to both sides when possible.
        return None
    # ${foo} / {foo} / {session_id} → {id}
    path = DYNAMIC_RE.sub("{id}", path)
    path = PARAM_RE.sub("{id}", path)
    # Collapse accidental {id}/{id} from ternary leftovers already filtered
    path = re.sub(r"/+", "/", path)
    if not path.startswith("/"):
        return None
    if not (
        path.startswith("/api/")
        or path == "/agui"
        or path.startswith("/agui/")
        or path in ("/openapi.json", "/docs")
    ):
        return None
    # Drop broken paths
    if path.endswith("/{id}/{id}") and "pause" not in path:
        # keep legitimate ones; filter double-id from ternary:
        # /api/cron/jobs/{id}/{id} is the ternary pause/resume pattern → expand later
        pass
    return path.rstrip("/") if path != "/agui" else "/agui"


def expand_cron_ternary(text: str) -> Set[str]:
    """Detect pause/resume ternary and emit both concrete paths."""
    out: Set[str] = set()
    if re.search(r"/api/cron/jobs/.+/(pause|resume)", text):
        out.update(
            {
                "/api/cron/jobs/{id}/pause",
                "/api/cron/jobs/{id}/resume",
            }
        )
    if "pause" in text and "resume" in text and "/api/cron/jobs/" in text:
        out.update(
            {
                "/api/cron/jobs/{id}/pause",
                "/api/cron/jobs/{id}/resume",
            }
        )
    return out


def scan_ui_paths() -> Dict[str, Set[str]]:
    """Return {normalized_path: set(methods or '*')} from UI source."""
    found: Dict[str, Set[str]] = {}

    def add(path: Optional[str], method: str = "*") -> None:
        if not path:
            return
        found.setdefault(path, set()).add(method.upper())

    for path in list(UI_SRC.rglob("*.ts")) + list(UI_SRC.rglob("*.tsx")):
        text = path.read_text(encoding="utf-8", errors="ignore")
        for m in expand_cron_ternary(text):
            add(m, "POST")

        for m in APICLIENT_CALL_RE.finditer(text):
            method = m.group(1)
            window = text[m.end() : m.end() + 400]
            pm = APICLIENT_PATH_RE.search(window)
            if pm:
                add(normalize_path(pm.group(2)), method)

        for m in FETCH_METHOD_RE.finditer(text):
            raw, method = m.group(2), m.group(3)
            add(normalize_path(raw), method)

        for m in FETCH_RE.finditer(text):
            raw = m.group(2)
            # Default GET for bare fetch unless method found above
            add(normalize_path(raw), "*")

        for m in NAV_RE.finditer(text):
            raw = m.group(1) or m.group(2) or ""
            # May be template with query
            if "/api/" in raw:
                # Extract path portion
                mm = re.search(r"(/api/[a-zA-Z0-9_/{}$.-]*)", raw)
                if mm:
                    add(normalize_path(mm.group(1)), "GET")

        # href={`/api/...`} JSX attributes
        for m in re.finditer(
            r"""href\s*=\s*(?:\{)?\s*(['"`])(/api/[^'"`]*|/agui(?:/[^'"`]*)?)\1""",
            text,
        ):
            add(normalize_path(m.group(2)), "GET")

        for m in LOOSE_RE.finditer(text):
            add(normalize_path(m.group(1)), "*")

    # Filter broken ternary residue
    cleaned: Dict[str, Set[str]] = {}
    for p, methods in found.items():
        if p.endswith("/{id}/{id}"):
            # Likely pause/resume ternary — already expanded
            continue
        if "/${" in p:
            continue
        cleaned[p] = methods
    return cleaned


def parse_inventory(md_text: str) -> Dict[str, Set[str]]:
    """Parse METHOD PATH lines from the canonical inventory fence."""
    if INVENTORY_BEGIN not in md_text or INVENTORY_END not in md_text:
        raise ValueError(
            f"Missing {INVENTORY_BEGIN} … {INVENTORY_END} block in {MD_PATH}"
        )
    block = md_text.split(INVENTORY_BEGIN, 1)[1].split(INVENTORY_END, 1)[0]
    # Strip markdown fence if present
    block = re.sub(r"```\w*\n?", "", block)
    out: Dict[str, Set[str]] = {}
    for line in block.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 2:
            raise ValueError(f"Bad inventory line (want METHOD PATH): {line!r}")
        method, path = parts[0].upper(), parts[1]
        # Allow METHOD1/METHOD2
        methods = [m.strip().upper() for m in method.split("/") if m.strip()]
        norm = normalize_path(path)
        if not norm:
            raise ValueError(f"Bad inventory path: {path!r}")
        out.setdefault(norm, set()).update(methods)
    return out


def paths_mentioned_in_prose(md_text: str) -> Set[str]:
    """Collect path-like tokens from markdown tables/prose (soft check)."""
    found: Set[str] = set()
    for m in re.finditer(r"`(/api/[^`?\s]+|/agui)`", md_text):
        n = normalize_path(m.group(1))
        if n:
            found.add(n)
    # Comma-separated shorthand in "Not mounted" table
    for m in re.finditer(r"/api/[a-zA-Z0-9_/{}.-]+", md_text):
        n = normalize_path(m.group(0))
        if n:
            found.add(n)
    return found


def fetch_openapi(hermes_url: str) -> Optional[Set[str]]:
    base = hermes_url.rstrip("/")
    token = None
    try:
        with urllib.request.urlopen(f"{base}/api/marko/boot", timeout=3) as resp:
            body = json.loads(resp.read().decode())
            token = body.get("token")
    except Exception:
        token = None

    req = urllib.request.Request(f"{base}/openapi.json")
    if token:
        req.add_header("X-Hermes-Session-Token", str(token))
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            schema = json.loads(resp.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print(f"warn: could not fetch OpenAPI from {base}: {exc}", file=sys.stderr)
        return None

    paths: Set[str] = set()
    for p in (schema.get("paths") or {}):
        n = normalize_path(str(p).replace("{session_id}", "{id}")
                           .replace("{job_id}", "{id}")
                           .replace("{server_id}", "{id}")
                           .replace("{skill_id}", "{id}")
                           .replace("{task_id}", "{id}")
                           .replace("{entry_id}", "{id}")
                           .replace("{name}", "{id}")
                           .replace("{full_path}", "{id}"))
        if n:
            paths.add(n)
    return paths


def path_matches_openapi(ui_path: str, openapi: Set[str]) -> bool:
    if ui_path in openapi:
        return True
    # {name} vs {id}
    alt = ui_path.replace("{id}", "{name}")
    if alt in openapi:
        return True
    # Prefix match for parameterized OpenAPI forms already normalized
    return False


# Families intentionally missing on Hermes — inventory must still list them,
# but OpenAPI absence is OK.
KNOWN_MISSING_PREFIXES = (
    "/api/approval",
    "/api/cowork",
    "/api/office",
    "/api/debug",
    "/api/auth/get-session",
    "/api/auth/sign-in",
    "/api/cron/wizard",
)


def is_known_missing(path: str) -> bool:
    return any(path == p or path.startswith(p + "/") or path.startswith(p) for p in KNOWN_MISSING_PREFIXES)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--hermes",
        default=None,
        help="Hermes base URL for OpenAPI cross-check (default: env HERMES_URL or http://127.0.0.1:9119)",
    )
    parser.add_argument(
        "--skip-openapi",
        action="store_true",
        help="Do not contact Hermes OpenAPI",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print machine-readable JSON report",
    )
    args = parser.parse_args(argv)

    if not MD_PATH.is_file():
        print(f"error: missing {MD_PATH}", file=sys.stderr)
        return 2

    md_text = MD_PATH.read_text(encoding="utf-8")
    try:
        inventory = parse_inventory(md_text)
    except ValueError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    ui = scan_ui_paths()
    prose = paths_mentioned_in_prose(md_text)

    missing_docs = sorted(p for p in ui if p not in inventory)
    stale_inventory = sorted(p for p in inventory if p not in ui and p not in ("/openapi.json", "/docs"))
    # /openapi.json and /docs are integration paths, not UI calls — allow in inventory
    allowed_extra = {"/openapi.json", "/docs", "/api/auth/me", "/api/auth/providers"}
    stale_inventory = [p for p in stale_inventory if p not in allowed_extra]

    # Soft: inventory path should appear somewhere in prose tables too
    not_in_prose = sorted(
        p for p in inventory if p not in prose and p not in allowed_extra
    )

    openapi: Optional[Set[str]] = None
    openapi_absent: List[str] = []
    if not args.skip_openapi:
        hermes = args.hermes or __import__("os").environ.get("HERMES_URL") or "http://127.0.0.1:9119"
        openapi = fetch_openapi(hermes)
        if openapi is not None:
            for p in sorted(inventory):
                if p in allowed_extra:
                    continue
                if is_known_missing(p):
                    continue
                if not path_matches_openapi(p, openapi):
                    openapi_absent.append(p)

    report = {
        "ui_path_count": len(ui),
        "inventory_path_count": len(inventory),
        "missing_from_docs": missing_docs,
        "stale_in_inventory": stale_inventory,
        "inventory_not_in_prose": not_in_prose,
        "openapi_absent_unexpected": openapi_absent,
        "ok": not missing_docs,
    }

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"UI API paths discovered: {len(ui)}")
        print(f"Inventory paths in {MD_PATH.relative_to(ROOT)}: {len(inventory)}")
        if missing_docs:
            print("\nMISSING from docs/marko-ui-features/API_MAPPING.md inventory:")
            for p in missing_docs:
                methods = ",".join(sorted(ui[p]))
                print(f"  - {methods:12} {p}")
        else:
            print("\n✓ Every UI API path is listed in the inventory.")

        if stale_inventory:
            print("\nStale inventory (not found in UI — remove or mark unused):")
            for p in stale_inventory:
                print(f"  - {p}")

        if not_in_prose:
            print("\nInventory paths not mentioned in MD prose/tables (add a row):")
            for p in not_in_prose:
                print(f"  - {p}")

        if openapi is None and not args.skip_openapi:
            print("\nOpenAPI: skipped/unreachable (inventory-only check ran).")
        elif openapi is not None:
            print(f"\nOpenAPI paths: {len(openapi)}")
            if openapi_absent:
                print("Inventory paths not in live OpenAPI (unexpected):")
                for p in openapi_absent:
                    print(f"  - {p}")
            else:
                print("✓ Wired inventory paths present in OpenAPI (known-missing families exempt).")

    return 0 if report["ok"] and not not_in_prose else 1


if __name__ == "__main__":
    sys.exit(main())
