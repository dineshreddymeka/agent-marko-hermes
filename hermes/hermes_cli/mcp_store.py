"""SQLite-backed MCP server registry (per-profile ``$HERMES_HOME/mcp.db``).

The DB is the source of truth for MCP server configuration, connection status,
and discovery cache. ``config.yaml`` ``mcp_servers`` is mirrored on every write
so the CLI and legacy tooling stay in sync.

On first open, if the DB is empty, existing ``config.yaml`` entries are
imported once (boot sync).
"""

from __future__ import annotations

import contextlib
import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from hermes_cli.sqlite_util import write_txn
from hermes_constants import get_hermes_home

_BOOT_LOCK = threading.Lock()
_BOOTSTRAPPED_PATHS: set[str] = set()

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS mcp_servers (
    name                      TEXT PRIMARY KEY,
    config_json               TEXT NOT NULL,
    description               TEXT,
    metadata_json             TEXT,
    http_prefer_sse           INTEGER NOT NULL DEFAULT 0,
    timeout_ms                INTEGER,
    auto_reconnect            INTEGER NOT NULL DEFAULT 1,
    discovered_tools_json     TEXT,
    discovered_resources_json TEXT,
    discovered_prompts_json   TEXT,
    last_status               TEXT,
    last_error                TEXT,
    last_connected_at         TEXT,
    last_tested_at            TEXT,
    created_at                TEXT NOT NULL,
    updated_at                TEXT NOT NULL
);
"""


def mcp_db_path() -> Path:
    return get_hermes_home() / "mcp.db"


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _json_loads(raw: Optional[str], default: Any) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return default


def connect(db_path: Optional[Path] = None) -> sqlite3.Connection:
    path = db_path if db_path is not None else mcp_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    try:
        conn.row_factory = sqlite3.Row
        from hermes_state import apply_wal_with_fallback

        apply_wal_with_fallback(conn, db_label="mcp.db")
        conn.execute("PRAGMA foreign_keys=ON")
        conn.executescript(SCHEMA_SQL)
    except Exception:
        conn.close()
        raise
    return conn


@contextlib.contextmanager
def connect_closing(db_path: Optional[Path] = None):
    conn = connect(db_path=db_path)
    try:
        yield conn
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _row_to_config(row: sqlite3.Row) -> dict:
    cfg = _json_loads(row["config_json"], {})
    if not isinstance(cfg, dict):
        cfg = {}
    return dict(cfg)


def _sync_config_yaml(conn: sqlite3.Connection) -> None:
    """Mirror all DB rows into ``config.yaml`` ``mcp_servers``."""
    from hermes_cli.config import load_config, save_config

    rows = conn.execute(
        "SELECT name, config_json FROM mcp_servers ORDER BY name"
    ).fetchall()
    servers: Dict[str, dict] = {}
    for row in rows:
        cfg = _row_to_config(row)
        if cfg:
            servers[row["name"]] = cfg
    config = load_config()
    if servers:
        config["mcp_servers"] = servers
    else:
        config.pop("mcp_servers", None)
    save_config(config)


def _import_config_yaml(conn: sqlite3.Connection) -> int:
    """One-time import from config.yaml when the DB table is empty."""
    from hermes_cli.config import load_config

    config = load_config()
    servers = config.get("mcp_servers")
    if not servers or not isinstance(servers, dict):
        return 0
    now = _iso_now()
    imported = 0
    with write_txn(conn):
        for name, cfg in sorted(servers.items()):
            if not isinstance(cfg, dict):
                continue
            conn.execute(
                """
                INSERT INTO mcp_servers (
                    name, config_json, description, metadata_json,
                    http_prefer_sse, timeout_ms, auto_reconnect,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    name,
                    _json_dumps(cfg),
                    None,
                    None,
                    0,
                    None,
                    1,
                    now,
                    now,
                ),
            )
            imported += 1
    return imported


def ensure_bootstrapped(db_path: Optional[Path] = None) -> None:
    """Open the store and import config.yaml once when empty."""
    path = db_path if db_path is not None else mcp_db_path()
    resolved = str(path.resolve())
    if resolved in _BOOTSTRAPPED_PATHS:
        return
    with _BOOT_LOCK:
        if resolved in _BOOTSTRAPPED_PATHS:
            return
        with connect_closing(path) as conn:
            count = conn.execute("SELECT COUNT(*) AS n FROM mcp_servers").fetchone()["n"]
            if count == 0:
                _import_config_yaml(conn)
        _BOOTSTRAPPED_PATHS.add(resolved)


def list_configs(db_path: Optional[Path] = None) -> Dict[str, dict]:
    """Return ``{name: config}`` for runtime MCP registration."""
    ensure_bootstrapped(db_path)
    with connect_closing(db_path) as conn:
        rows = conn.execute(
            "SELECT name, config_json FROM mcp_servers ORDER BY name"
        ).fetchall()
        out: Dict[str, dict] = {}
        for row in rows:
            cfg = _row_to_config(row)
            if cfg:
                out[row["name"]] = cfg
        return out


def list_rows(db_path: Optional[Path] = None) -> List[sqlite3.Row]:
    ensure_bootstrapped(db_path)
    with connect_closing(db_path) as conn:
        return list(
            conn.execute("SELECT * FROM mcp_servers ORDER BY name").fetchall()
        )


def get_row(name: str, db_path: Optional[Path] = None) -> Optional[sqlite3.Row]:
    ensure_bootstrapped(db_path)
    with connect_closing(db_path) as conn:
        return conn.execute(
            "SELECT * FROM mcp_servers WHERE name = ?", (name,)
        ).fetchone()


def upsert_server(
    name: str,
    config: dict,
    *,
    description: Optional[str] = None,
    metadata: Optional[dict] = None,
    http_prefer_sse: bool = False,
    timeout_ms: Optional[int] = None,
    auto_reconnect: bool = True,
    db_path: Optional[Path] = None,
) -> bool:
    """Insert or update a server. Returns False when validation rejects config."""
    from hermes_cli.mcp_security import validate_mcp_server_entry

    issues = validate_mcp_server_entry(name, config)
    if issues:
        return False
    ensure_bootstrapped(db_path)
    now = _iso_now()
    with connect_closing(db_path) as conn:
        existing = conn.execute(
            "SELECT created_at FROM mcp_servers WHERE name = ?", (name,)
        ).fetchone()
        created_at = existing["created_at"] if existing else now
        with write_txn(conn):
            conn.execute(
                """
                INSERT INTO mcp_servers (
                    name, config_json, description, metadata_json,
                    http_prefer_sse, timeout_ms, auto_reconnect,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(name) DO UPDATE SET
                    config_json = excluded.config_json,
                    description = COALESCE(excluded.description, mcp_servers.description),
                    metadata_json = COALESCE(excluded.metadata_json, mcp_servers.metadata_json),
                    http_prefer_sse = excluded.http_prefer_sse,
                    timeout_ms = excluded.timeout_ms,
                    auto_reconnect = excluded.auto_reconnect,
                    updated_at = excluded.updated_at
                """,
                (
                    name,
                    _json_dumps(config),
                    description,
                    _json_dumps(metadata) if metadata else None,
                    1 if http_prefer_sse else 0,
                    timeout_ms,
                    1 if auto_reconnect else 0,
                    created_at,
                    now,
                ),
            )
            _sync_config_yaml(conn)
    return True


def delete_server(name: str, db_path: Optional[Path] = None) -> bool:
    ensure_bootstrapped(db_path)
    with connect_closing(db_path) as conn:
        with write_txn(conn):
            cur = conn.execute("DELETE FROM mcp_servers WHERE name = ?", (name,))
            if cur.rowcount == 0:
                return False
            _sync_config_yaml(conn)
    return True


def replace_all(
    servers: Dict[str, dict], db_path: Optional[Path] = None
) -> Tuple[bool, List[str]]:
    from hermes_cli.mcp_security import validate_mcp_server_entry

    issues: List[str] = []
    for name, cfg in servers.items():
        if not isinstance(cfg, dict):
            issues.append(f"Server '{name}': expected an object")
            continue
        issues.extend(validate_mcp_server_entry(name, cfg))
    if issues:
        return False, issues

    ensure_bootstrapped(db_path)
    now = _iso_now()
    with connect_closing(db_path) as conn:
        with write_txn(conn):
            conn.execute("DELETE FROM mcp_servers")
            for name, cfg in sorted(servers.items()):
                conn.execute(
                    """
                    INSERT INTO mcp_servers (
                        name, config_json, created_at, updated_at
                    ) VALUES (?, ?, ?, ?)
                    """,
                    (name, _json_dumps(cfg), now, now),
                )
            _sync_config_yaml(conn)
    return True, []


def set_enabled(name: str, enabled: bool, db_path: Optional[Path] = None) -> bool:
    row = get_row(name, db_path=db_path)
    if row is None:
        return False
    cfg = _row_to_config(row)
    cfg["enabled"] = bool(enabled)
    return upsert_server(
        name,
        cfg,
        description=row["description"],
        metadata=_json_loads(row["metadata_json"], None),
        http_prefer_sse=bool(row["http_prefer_sse"]),
        timeout_ms=row["timeout_ms"],
        auto_reconnect=bool(row["auto_reconnect"]),
        db_path=db_path,
    )


def update_probe_result(
    name: str,
    *,
    ok: bool,
    error: Optional[str] = None,
    tools: Optional[List[Dict[str, str]]] = None,
    resources: Optional[List[Dict[str, str]]] = None,
    prompts: Optional[List[Dict[str, str]]] = None,
    db_path: Optional[Path] = None,
) -> None:
    """Persist last test / discovery cache after a probe."""
    ensure_bootstrapped(db_path)
    now = _iso_now()
    status = "connected" if ok else "error"
    with connect_closing(db_path) as conn:
        with write_txn(conn):
            conn.execute(
                """
                UPDATE mcp_servers SET
                    last_status = ?,
                    last_error = ?,
                    last_tested_at = ?,
                    last_connected_at = CASE WHEN ? THEN ? ELSE last_connected_at END,
                    discovered_tools_json = ?,
                    discovered_resources_json = ?,
                    discovered_prompts_json = ?,
                    updated_at = ?
                WHERE name = ?
                """,
                (
                    status,
                    error,
                    now,
                    ok,
                    now,
                    _json_dumps(tools or []),
                    _json_dumps(resources or []),
                    _json_dumps(prompts or []),
                    now,
                    name,
                ),
            )


def _transport_from_config(cfg: dict) -> str:
    if cfg.get("url"):
        return "http"
    if cfg.get("command"):
        return "stdio"
    return "unknown"


def _tool_whitelist_from_config(tools_cfg: Any) -> Optional[List[str]]:
    if tools_cfg is None:
        return None
    if isinstance(tools_cfg, list):
        return [str(t) for t in tools_cfg]
    if isinstance(tools_cfg, dict):
        include = tools_cfg.get("include")
        if isinstance(include, list) and include:
            return [str(t) for t in include]
    return None


def row_to_api_dto(row: sqlite3.Row, *, redact_env) -> Dict[str, Any]:
    """Full Marko/Open Jarvis-compatible server DTO from a DB row."""
    cfg = _row_to_config(row)
    transport = _transport_from_config(cfg)
    env = cfg.get("env") or {}
    if isinstance(env, dict):
        env_out = {str(k): redact_env(str(v)) if v else "" for k, v in env.items()}
    else:
        env_out = {}

    tools_cache = _json_loads(row["discovered_tools_json"], [])
    resources_cache = _json_loads(row["discovered_resources_json"], [])
    prompts_cache = _json_loads(row["discovered_prompts_json"], [])

    return {
        "id": row["name"],
        "name": row["name"],
        "description": row["description"],
        "transport": transport if transport != "unknown" else "stdio",
        "command": cfg.get("command"),
        "url": cfg.get("url"),
        "args": list(cfg.get("args") or []),
        "env": env_out,
        "headers": cfg.get("headers"),
        "auth": cfg.get("auth"),
        "enabled": cfg.get("enabled", True) is not False,
        "toolWhitelist": _tool_whitelist_from_config(cfg.get("tools")),
        "tools": cfg.get("tools"),
        "httpPreferSse": bool(row["http_prefer_sse"]),
        "timeoutMs": row["timeout_ms"],
        "autoReconnect": bool(row["auto_reconnect"]),
        "lastStatus": row["last_status"],
        "lastError": row["last_error"],
        "lastConnectedAt": row["last_connected_at"],
        "lastTestedAt": row["last_tested_at"],
        "discoveredTools": tools_cache if tools_cache else None,
        "discoveredResources": resources_cache if resources_cache else None,
        "discoveredPrompts": prompts_cache if prompts_cache else None,
        "metadata": _json_loads(row["metadata_json"], None),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def row_to_summary(row: sqlite3.Row, *, redact_env) -> Dict[str, Any]:
    """Legacy Hermes dashboard summary (name-keyed, redacted env)."""
    cfg = _row_to_config(row)
    return {
        "name": row["name"],
        "transport": _transport_from_config(cfg),
        "url": cfg.get("url"),
        "command": cfg.get("command"),
        "args": list(cfg.get("args") or []),
        "env": {
            str(k): redact_env(str(v)) if v else ""
            for k, v in (cfg.get("env") or {}).items()
        }
        if isinstance(cfg.get("env"), dict)
        else {},
        "auth": cfg.get("auth"),
        "enabled": cfg.get("enabled", True) is not False,
        "tools": cfg.get("tools"),
        "lastStatus": row["last_status"],
        "lastError": row["last_error"],
        "lastTestedAt": row["last_tested_at"],
        "discoveredTools": _json_loads(row["discovered_tools_json"], None),
    }
