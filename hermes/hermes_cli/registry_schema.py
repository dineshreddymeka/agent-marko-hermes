"""SQLite schema for skills and MCP server registries in ``state.db``.

Tables live alongside session storage so the dashboard/API can index every
skill and MCP server without a separate Postgres/Bun store.  DDL is applied
idempotently from :func:`ensure_registry_schema` — called by
``SessionDB._init_schema`` and by registry ``connect()`` helpers.
"""

from __future__ import annotations

import sqlite3

REGISTRY_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    body_md TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    disk_path TEXT,
    source TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    provenance_json TEXT,
    usage_json TEXT,
    missing_on_disk INTEGER DEFAULT 0,
    last_synced_at TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    config_json TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    transport TEXT,
    last_status TEXT,
    last_error TEXT,
    discovered_tools_json TEXT,
    last_tested_at TEXT,
    created_at TEXT,
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS mcp_connection_events (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT,
    detail_json TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skills_slug ON skills(slug);
CREATE INDEX IF NOT EXISTS idx_skills_source ON skills(source);
CREATE INDEX IF NOT EXISTS idx_mcp_servers_name ON mcp_servers(name);
CREATE INDEX IF NOT EXISTS idx_mcp_connection_events_server
    ON mcp_connection_events(server_id, created_at DESC);
"""


def ensure_registry_schema(conn: sqlite3.Connection) -> None:
    """Create registry tables and indexes if they do not exist."""
    conn.executescript(REGISTRY_SCHEMA_SQL)
