"""MCP server registry — SQLite index over ``config.yaml`` ``mcp_servers``.

DB is the authoritative index for UI/API retrieval; ``config.yaml`` remains
the runtime source for ``_load_mcp_config``.  Every mutation writes DB first,
then exports to YAML.
"""

from __future__ import annotations

import contextlib
import json
import logging
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from hermes_cli.registry_schema import ensure_registry_schema
from hermes_cli.sqlite_util import write_txn

_log = logging.getLogger(__name__)

_INITIALIZED_PATHS: set[str] = set()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_server_id() -> str:
    return "mcp_" + secrets.token_hex(8)


def _new_event_id() -> str:
    return "evt_" + secrets.token_hex(8)


def connect(db_path: Optional[Path] = None) -> sqlite3.Connection:
    from hermes_state import apply_wal_with_fallback
    from hermes_constants import get_hermes_home

    path = db_path if db_path is not None else (get_hermes_home() / "state.db")
    path.parent.mkdir(parents=True, exist_ok=True)
    resolved = str(path.resolve())
    conn = sqlite3.connect(
        str(path),
        check_same_thread=False,
        isolation_level=None,
    )
    conn.row_factory = sqlite3.Row
    apply_wal_with_fallback(conn, db_label="state.db")
    conn.execute("PRAGMA foreign_keys=ON")
    if resolved not in _INITIALIZED_PATHS:
        ensure_registry_schema(conn)
        _INITIALIZED_PATHS.add(resolved)
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


def _infer_transport(cfg: Dict[str, Any]) -> str:
    if cfg.get("url"):
        return "http"
    if cfg.get("command"):
        return "stdio"
    return "stdio"


def _api_body_to_config(body: Dict[str, Any]) -> Dict[str, Any]:
    """Map dashboard camelCase create/patch body to config.yaml shape."""
    cfg: Dict[str, Any] = {}
    transport = body.get("transport") or _infer_transport(body)
    if transport == "http" or body.get("url"):
        if body.get("url"):
            cfg["url"] = str(body["url"]).strip()
    else:
        cmd = body.get("command")
        if cmd:
            cfg["command"] = str(cmd).strip()
        args = body.get("args")
        if args:
            cfg["args"] = list(args)

    if body.get("env"):
        cfg["env"] = dict(body["env"])
    if body.get("headers"):
        cfg["headers"] = dict(body["headers"])
    if body.get("auth"):
        cfg["auth"] = body["auth"]

    enabled = body.get("enabled")
    if enabled is not None:
        cfg["enabled"] = bool(enabled)

    if body.get("httpPreferSse") is not None:
        cfg["http_prefer_sse"] = bool(body["httpPreferSse"])
    if body.get("timeoutMs") is not None:
        try:
            ms = int(body["timeoutMs"])
            cfg["connect_timeout"] = max(1.0, ms / 1000.0)
        except (TypeError, ValueError):
            pass
    if body.get("autoReconnect") is not None:
        cfg["auto_reconnect"] = bool(body["autoReconnect"])
    if body.get("toolWhitelist") is not None:
        wl = body["toolWhitelist"]
        cfg["tools"] = list(wl) if wl else None

    description = body.get("description")
    metadata = dict(body.get("metadata") or {})
    if description:
        metadata.setdefault("description", description)
    if metadata:
        cfg["_ui"] = metadata
    return cfg


def _redact_mcp_env(env: Dict[str, Any]) -> Dict[str, str]:
    from hermes_cli.config import redact_key

    out: Dict[str, str] = {}
    for k, v in (env or {}).items():
        try:
            out[str(k)] = redact_key(str(v)) if v else ""
        except Exception:
            out[str(k)] = "***"
    return out


def _config_to_api(row: sqlite3.Row) -> Dict[str, Any]:
    cfg = json.loads(row["config_json"] or "{}")
    ui = cfg.get("_ui") or {}
    if not isinstance(ui, dict):
        ui = {}
    description = ui.get("description")
    if not description and isinstance(cfg.get("description"), str):
        description = cfg["description"]

    tools_filter = cfg.get("tools")
    tool_whitelist = None
    if isinstance(tools_filter, list):
        tool_whitelist = tools_filter
    elif isinstance(tools_filter, dict):
        wl = tools_filter.get("whitelist")
        if isinstance(wl, list):
            tool_whitelist = wl

    discovered = None
    resources = None
    prompts = None
    if row["discovered_tools_json"]:
        try:
            discovered = json.loads(row["discovered_tools_json"])
        except json.JSONDecodeError:
            discovered = None
        if isinstance(discovered, dict):
            resources = discovered.get("resources")
            prompts = discovered.get("prompts")
            discovered = discovered.get("tools")

    env = cfg.get("env") or {}
    headers = cfg.get("headers") or {}
    env_out = _redact_mcp_env(env)

    timeout_ms = None
    raw_timeout = cfg.get("connect_timeout")
    if raw_timeout is not None:
        try:
            timeout_ms = int(float(raw_timeout) * 1000)
        except (TypeError, ValueError):
            pass

    transport = row["transport"] or _infer_transport(cfg)
    command = cfg.get("command")
    if command and cfg.get("args"):
        command = f"{command} {' '.join(str(a) for a in cfg['args'])}"

    return {
        "id": row["id"],
        "name": row["name"],
        "description": description,
        "transport": "http" if transport == "http" else "stdio",
        "command": command if transport != "http" else None,
        "url": cfg.get("url"),
        "env": env_out or None,
        "headers": headers or None,
        "enabled": bool(row["enabled"]),
        "toolWhitelist": tool_whitelist,
        "httpPreferSse": bool(cfg.get("http_prefer_sse", False)),
        "timeoutMs": timeout_ms,
        "autoReconnect": cfg.get("auto_reconnect", True) is not False,
        "lastStatus": row["last_status"],
        "lastError": row["last_error"],
        "lastConnectedAt": ui.get("lastConnectedAt"),
        "lastTestedAt": row["last_tested_at"],
        "discoveredTools": discovered,
        "discoveredResources": resources,
        "discoveredPrompts": prompts,
        "metadata": ui or None,
        "createdAt": row["created_at"] or _now_iso(),
        "updatedAt": row["updated_at"] or _now_iso(),
    }


def list_all() -> List[Dict[str, Any]]:
    with connect_closing() as conn:
        rows = conn.execute(
            "SELECT * FROM mcp_servers ORDER BY name COLLATE NOCASE"
        ).fetchall()
    return [_config_to_api(r) for r in rows]


def get_by_id(server_id: str) -> Optional[Dict[str, Any]]:
    with connect_closing() as conn:
        row = conn.execute(
            "SELECT * FROM mcp_servers WHERE id = ?", (server_id,)
        ).fetchone()
    return _config_to_api(row) if row else None


def get_by_name(name: str) -> Optional[Dict[str, Any]]:
    with connect_closing() as conn:
        row = conn.execute(
            "SELECT * FROM mcp_servers WHERE name = ?", (name,)
        ).fetchone()
    return _config_to_api(row) if row else None


def export_to_config_yaml() -> None:
    """Write all DB rows to ``config.yaml`` ``mcp_servers``."""
    from hermes_cli.config import load_config, save_config

    with connect_closing() as conn:
        rows = conn.execute("SELECT name, config_json, enabled FROM mcp_servers").fetchall()

    servers: Dict[str, Any] = {}
    for row in rows:
        cfg = json.loads(row["config_json"] or "{}")
        if not row["enabled"]:
            cfg["enabled"] = False
        elif cfg.get("enabled") is False:
            cfg.pop("enabled", None)
        servers[row["name"]] = cfg

    config = load_config()
    if servers:
        config["mcp_servers"] = servers
    else:
        config.pop("mcp_servers", None)
    save_config(config)


def sync_from_config_yaml() -> int:
    """Import ``config.yaml`` mcp_servers into DB (upsert by name)."""
    from hermes_cli.mcp_config import _get_mcp_servers

    servers = _get_mcp_servers()
    now = _now_iso()
    imported = 0

    with connect_closing() as conn:
        with write_txn(conn):
            for name, cfg in servers.items():
                cfg = dict(cfg)
                enabled = cfg.get("enabled", True) is not False
                transport = _infer_transport(cfg)
                existing = conn.execute(
                    "SELECT id FROM mcp_servers WHERE name = ?", (name,)
                ).fetchone()
                if existing:
                    conn.execute(
                        """UPDATE mcp_servers SET config_json = ?, enabled = ?,
                               transport = ?, updated_at = ? WHERE id = ?""",
                        (
                            json.dumps(cfg),
                            1 if enabled else 0,
                            transport,
                            now,
                            existing["id"],
                        ),
                    )
                else:
                    conn.execute(
                        """INSERT INTO mcp_servers (
                               id, name, config_json, enabled, transport,
                               created_at, updated_at
                           ) VALUES (?, ?, ?, ?, ?, ?, ?)""",
                        (
                            _new_server_id(),
                            name,
                            json.dumps(cfg),
                            1 if enabled else 0,
                            transport,
                            now,
                            now,
                        ),
                    )
                imported += 1
    return imported


def create_server(body: Dict[str, Any]) -> Dict[str, Any]:
    name = (body.get("name") or "").strip()
    if not name:
        raise ValueError("Server name is required")

    cfg = _api_body_to_config(body)
    from hermes_cli.mcp_security import validate_mcp_server_entry

    issues = validate_mcp_server_entry(name, cfg)
    if issues:
        raise ValueError("; ".join(issues))

    server_id = _new_server_id()
    now = _now_iso()
    enabled = body.get("enabled", True) is not False
    transport = body.get("transport") or _infer_transport(cfg)

    with connect_closing() as conn:
        if conn.execute(
            "SELECT 1 FROM mcp_servers WHERE name = ?", (name,)
        ).fetchone():
            raise ValueError(f"Server '{name}' already exists")
        with write_txn(conn):
            conn.execute(
                """INSERT INTO mcp_servers (
                       id, name, config_json, enabled, transport,
                       created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    server_id,
                    name,
                    json.dumps(cfg),
                    1 if enabled else 0,
                    transport,
                    now,
                    now,
                ),
            )
    export_to_config_yaml()
    return get_by_id(server_id) or {"id": server_id, "name": name}


def update_server(server_id: str, patch: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    with connect_closing() as conn:
        row = conn.execute(
            "SELECT * FROM mcp_servers WHERE id = ?", (server_id,)
        ).fetchone()
        if not row:
            return None

        cfg = json.loads(row["config_json"] or "{}")
        partial = _api_body_to_config({**patch, "name": row["name"]})
        for key, val in partial.items():
            if key == "_ui":
                cfg["_ui"] = {**(cfg.get("_ui") or {}), **val}
            else:
                cfg[key] = val
        if patch.get("metadata"):
            cfg["_ui"] = {**(cfg.get("_ui") or {}), **dict(patch["metadata"])}
        if patch.get("description") is not None:
            cfg["_ui"] = {**(cfg.get("_ui") or {}), "description": patch["description"]}

        from hermes_cli.mcp_security import validate_mcp_server_entry

        issues = validate_mcp_server_entry(row["name"], cfg)
        if issues:
            raise ValueError("; ".join(issues))

        if "enabled" in patch:
            enabled_val = bool(patch["enabled"])
        else:
            enabled_val = bool(row["enabled"])

        now = _now_iso()
        transport = patch.get("transport") or row["transport"] or _infer_transport(cfg)
        with write_txn(conn):
            conn.execute(
                """UPDATE mcp_servers SET config_json = ?, enabled = ?,
                       transport = ?, updated_at = ? WHERE id = ?""",
                (json.dumps(cfg), 1 if enabled_val else 0, transport, now, server_id),
            )
    export_to_config_yaml()
    return get_by_id(server_id)


def delete_server(server_id: str) -> bool:
    with connect_closing() as conn:
        row = conn.execute(
            "SELECT id FROM mcp_servers WHERE id = ?", (server_id,)
        ).fetchone()
        if not row:
            return False
        with write_txn(conn):
            conn.execute("DELETE FROM mcp_servers WHERE id = ?", (server_id,))
    export_to_config_yaml()
    return True


def append_connection_event(
    server_id: str,
    *,
    event_type: str,
    status: Optional[str] = None,
    detail: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    now = _now_iso()
    event_id = _new_event_id()
    with connect_closing() as conn:
        with write_txn(conn):
            conn.execute(
                """INSERT INTO mcp_connection_events (
                       id, server_id, event_type, status, detail_json, created_at
                   ) VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    event_id,
                    server_id,
                    event_type,
                    status,
                    json.dumps(detail) if detail else None,
                    now,
                ),
            )
    return {
        "id": event_id,
        "serverId": server_id,
        "eventType": event_type,
        "status": status,
        "transportKind": (detail or {}).get("transportKind"),
        "detail": detail,
        "createdAt": now,
    }


def list_connection_events(server_id: str, *, limit: int = 100) -> List[Dict[str, Any]]:
    with connect_closing() as conn:
        rows = conn.execute(
            """SELECT * FROM mcp_connection_events
               WHERE server_id = ? ORDER BY created_at DESC LIMIT ?""",
            (server_id, limit),
        ).fetchall()
    out = []
    for row in rows:
        detail = None
        if row["detail_json"]:
            try:
                detail = json.loads(row["detail_json"])
            except json.JSONDecodeError:
                detail = None
        out.append(
            {
                "id": row["id"],
                "serverId": row["server_id"],
                "eventType": row["event_type"],
                "status": row["status"],
                "transportKind": (detail or {}).get("transportKind"),
                "detail": detail,
                "createdAt": row["created_at"],
            }
        )
    return out


def record_test_result(
    server_id: str,
    *,
    ok: bool,
    tools: List[Dict[str, Any]],
    error: Optional[str] = None,
    transport_kind: Optional[str] = None,
    resources: Optional[List[Any]] = None,
    prompts: Optional[List[Any]] = None,
) -> None:
    status = "connected" if ok else "error"
    now = _now_iso()
    discovered = {
        "tools": tools,
        "resources": resources or [],
        "prompts": prompts or [],
    }
    with connect_closing() as conn:
        with write_txn(conn):
            conn.execute(
                """UPDATE mcp_servers SET last_status = ?, last_error = ?,
                       discovered_tools_json = ?, last_tested_at = ?, updated_at = ?
                   WHERE id = ?""",
                (
                    status,
                    error,
                    json.dumps(discovered),
                    now,
                    now,
                    server_id,
                ),
            )
    append_connection_event(
        server_id,
        event_type="test",
        status=status,
        detail={
            "transportKind": transport_kind,
            "toolCount": len(tools),
            "error": error,
        },
    )


def maybe_bootstrap_from_config() -> None:
    with connect_closing() as conn:
        count = conn.execute("SELECT COUNT(*) FROM mcp_servers").fetchone()[0]
    if count == 0:
        sync_from_config_yaml()
