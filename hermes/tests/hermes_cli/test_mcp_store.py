"""Tests for the SQLite-backed MCP server store."""

import json

import pytest


@pytest.fixture
def mcp_db(_isolate_hermes_home, tmp_path, monkeypatch):
    from hermes_constants import get_hermes_home
    from hermes_cli import mcp_store

    home = get_hermes_home()
    db_path = home / "mcp.db"
    mcp_store._BOOTSTRAPPED_PATHS.discard(str(db_path.resolve()))
    yield db_path
    mcp_store._BOOTSTRAPPED_PATHS.discard(str(db_path.resolve()))


class TestMcpStore:
    def test_bootstrap_imports_config_yaml_once(self, mcp_db):
        from hermes_cli.config import load_config, save_config
        from hermes_cli import mcp_store

        cfg = load_config()
        cfg["mcp_servers"] = {"legacy": {"url": "https://legacy/mcp", "enabled": True}}
        save_config(cfg)

        mcp_store.ensure_bootstrapped(mcp_db)
        rows = mcp_store.list_rows(mcp_db)
        assert [r["name"] for r in rows] == ["legacy"]
        assert json.loads(rows[0]["config_json"])["url"] == "https://legacy/mcp"

    def test_upsert_and_list_roundtrip(self, mcp_db):
        from hermes_cli import mcp_store
        from hermes_cli.config import load_config

        assert mcp_store.upsert_server(
            "srv1",
            {"url": "https://x/mcp", "enabled": True},
            db_path=mcp_db,
        )
        configs = mcp_store.list_configs(mcp_db)
        assert "srv1" in configs
        assert configs["srv1"]["url"] == "https://x/mcp"
        assert "srv1" in load_config().get("mcp_servers", {})

    def test_delete_removes_db_and_yaml(self, mcp_db):
        from hermes_cli import mcp_store
        from hermes_cli.config import load_config

        mcp_store.upsert_server("gone", {"command": "npx"}, db_path=mcp_db)
        assert mcp_store.delete_server("gone", db_path=mcp_db)
        assert mcp_store.list_configs(mcp_db) == {}
        assert "gone" not in load_config().get("mcp_servers", {})

    def test_probe_result_persists_status_and_discovery(self, mcp_db):
        from hermes_cli import mcp_store

        mcp_store.upsert_server("probe", {"url": "https://p/mcp"}, db_path=mcp_db)
        mcp_store.update_probe_result(
            "probe",
            ok=True,
            tools=[{"name": "search", "description": "Search"}],
            db_path=mcp_db,
        )
        row = mcp_store.get_row("probe", db_path=mcp_db)
        assert row["last_status"] == "connected"
        assert row["last_tested_at"]
        tools = json.loads(row["discovered_tools_json"])
        assert tools[0]["name"] == "search"

    def test_api_dto_redacts_env(self, mcp_db):
        from hermes_cli import mcp_store

        mcp_store.upsert_server(
            "sec",
            {
                "command": "npx",
                "env": {"API_KEY": "sk-secret-1234567890"},
            },
            db_path=mcp_db,
        )
        row = mcp_store.get_row("sec", db_path=mcp_db)

        def redact(v: str) -> str:
            return v[:4] + "***" if len(v) > 8 else "***"

        dto = mcp_store.row_to_api_dto(row, redact_env=redact)
        assert dto["id"] == "sec"
        assert dto["env"]["API_KEY"] != "sk-secret-1234567890"
        assert dto["discoveredTools"] is None
