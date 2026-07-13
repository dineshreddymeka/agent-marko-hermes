"""Tests for SQLite-backed skills and MCP registries."""

import json
import yaml
import pytest


SKILL_MD = """---
name: {name}
description: a test skill
---

# {name}

Do the thing.
"""


def _write_skill(skills_dir, name):
    d = skills_dir / name
    d.mkdir(parents=True, exist_ok=True)
    (d / "SKILL.md").write_text(SKILL_MD.format(name=name), encoding="utf-8")


@pytest.fixture
def registry_env(tmp_path, monkeypatch, _isolate_hermes_home):
    import hermes_state
    from hermes_constants import get_hermes_home

    home = get_hermes_home()
    (home / "skills").mkdir(parents=True, exist_ok=True)
    (home / "config.yaml").write_text("{}\n", encoding="utf-8")
    _write_skill(home / "skills", "alpha-skill")
    monkeypatch.setattr(hermes_state, "DEFAULT_DB_PATH", home / "state.db")
    return home


class TestSkillsRegistry:
    def test_sync_and_list(self, registry_env):
        from hermes_cli import skills_registry

        result = skills_registry.sync_from_disk()
        assert result["created"] >= 1
        rows = skills_registry.list_all()
        names = {r["name"] for r in rows}
        assert "alpha-skill" in names
        assert rows[0]["bodyMd"].startswith("---")

    def test_create_materializes_disk(self, registry_env):
        from hermes_cli import skills_registry

        skill = skills_registry.create_skill(
            name="new-one",
            body_md=SKILL_MD.format(name="new-one"),
            source="user-folder",
        )
        path = registry_env / "skills" / "new-one" / "SKILL.md"
        assert path.exists()
        assert skill["id"].startswith("sk_")

    def test_meta_counts(self, registry_env):
        from hermes_cli import skills_registry

        skills_registry.sync_from_disk()
        meta = skills_registry.get_meta()
        assert meta["total"] >= 1
        assert meta["skillsDir"].endswith("/skills")


class TestMcpRegistry:
    def test_sync_from_config_yaml(self, registry_env):
        from hermes_cli import mcp_registry

        cfg = {
            "mcp_servers": {
                "demo": {"command": "echo", "args": ["hello"]},
            }
        }
        (registry_env / "config.yaml").write_text(yaml.dump(cfg), encoding="utf-8")
        count = mcp_registry.sync_from_config_yaml()
        assert count == 1
        servers = mcp_registry.list_all()
        assert len(servers) == 1
        assert servers[0]["name"] == "demo"
        assert servers[0]["command"] == "echo hello"

    def test_create_exports_yaml(self, registry_env):
        from hermes_cli import mcp_registry

        mcp_registry.create_server(
            {
                "name": "fs",
                "transport": "stdio",
                "command": "npx -y @modelcontextprotocol/server-filesystem .",
                "enabled": True,
            }
        )
        raw = yaml.safe_load((registry_env / "config.yaml").read_text())
        assert "fs" in raw["mcp_servers"]

    def test_connection_events(self, registry_env):
        from hermes_cli import mcp_registry

        server = mcp_registry.create_server(
            {"name": "evt", "transport": "stdio", "command": "echo", "enabled": True}
        )
        mcp_registry.append_connection_event(
            server["id"], event_type="test", status="connected", detail={"toolCount": 1}
        )
        events = mcp_registry.list_connection_events(server["id"])
        assert len(events) == 1
        assert events[0]["eventType"] == "test"


@pytest.fixture
def client(monkeypatch, registry_env):
    try:
        from starlette.testclient import TestClient
    except ImportError:
        pytest.skip("fastapi/starlette not installed")

    import hermes_state
    from hermes_constants import get_hermes_home
    from hermes_cli.web_server import app, _SESSION_HEADER_NAME, _SESSION_TOKEN

    monkeypatch.setattr(hermes_state, "DEFAULT_DB_PATH", get_hermes_home() / "state.db")
    c = TestClient(app)
    c.headers[_SESSION_HEADER_NAME] = _SESSION_TOKEN
    return c


class TestWebSkillsEndpoints:
    def test_list_and_meta(self, client):
        resp = client.get("/api/skills")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert any(s["name"] == "alpha-skill" for s in data)
        meta = client.get("/api/skills/meta").json()
        assert meta["total"] >= 1

    def test_sync_endpoint(self, client):
        resp = client.post("/api/skills/sync")
        assert resp.status_code == 200
        body = resp.json()
        assert "synced" in body
        assert "lastSyncedAt" in body


class TestWebMcpEndpoints:
    def test_list_servers_db_backed(self, client, registry_env):
        cfg = {"mcp_servers": {"web-demo": {"command": "echo", "args": ["x"]}}}
        (registry_env / "config.yaml").write_text(yaml.dump(cfg), encoding="utf-8")
        from hermes_cli import mcp_registry

        mcp_registry.sync_from_config_yaml()
        resp = client.get("/api/mcp/servers")
        assert resp.status_code == 200
        payload = resp.json()
        assert "servers" in payload
        assert any(s["name"] == "web-demo" for s in payload["servers"])

    def test_create_and_events(self, client):
        resp = client.post(
            "/api/mcp/servers",
            json={
                "name": "created-via-api",
                "transport": "stdio",
                "command": "echo",
                "enabled": True,
            },
        )
        assert resp.status_code == 200
        server = resp.json()
        assert server["id"].startswith("mcp_")
        events = client.get(f"/api/mcp/servers/{server['id']}/events").json()
        assert "events" in events
