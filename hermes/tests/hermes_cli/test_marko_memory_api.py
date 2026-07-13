"""Tests for Agent-Marko memory entries REST bridge."""

import pytest


def _client():
    try:
        from starlette.testclient import TestClient
    except ImportError:
        pytest.skip("fastapi/starlette not installed")
    import hermes_state
    from hermes_constants import get_hermes_home
    from hermes_cli.web_server import app, _SESSION_HEADER_NAME, _SESSION_TOKEN

    client = TestClient(app)
    client.headers[_SESSION_HEADER_NAME] = _SESSION_TOKEN
    hermes_state.DEFAULT_DB_PATH = get_hermes_home() / "state.db"
    return client


class TestMarkoMemoryEntries:
    @pytest.fixture(autouse=True)
    def _setup(self, _isolate_hermes_home):
        from hermes_constants import get_hermes_home

        self.client = _client()
        mem = get_hermes_home() / "memories"
        mem.mkdir(parents=True, exist_ok=True)
        (mem / "MEMORY.md").write_text("Likes pytest\n§\nUses Hermes memory")
        (mem / "USER.md").write_text("Prefers dark mode")

    def test_list_entries(self):
        rows = self.client.get("/api/memory/entries").json()
        assert len(rows) == 3
        ids = {row["id"] for row in rows}
        assert "memory-0" in ids and "memory-1" in ids and "user-0" in ids
        kinds = {row["kind"] for row in rows}
        assert "semantic" in kinds and "preference" in kinds

    def test_kind_filter(self):
        rows = self.client.get("/api/memory/entries", params={"kind": "preference"}).json()
        assert len(rows) == 1
        assert rows[0]["kind"] == "preference"

    def test_create_patch_delete_roundtrip(self):
        created = self.client.post(
            "/api/memory/entries",
            json={"kind": "semantic", "content": "New fact", "importance": 0.7},
        )
        assert created.status_code == 201
        body = created.json()
        assert body["content"] == "New fact"
        entry_id = body["id"]

        patched = self.client.patch(
            f"/api/memory/entries/{entry_id}",
            json={"content": "Updated fact", "importance": 0.9},
        )
        assert patched.status_code == 200
        assert patched.json()["content"] == "Updated fact"
        assert patched.json()["importance"] == 0.9

        deleted = self.client.delete(f"/api/memory/entries/{entry_id}")
        assert deleted.status_code == 200
        ids = {row["id"] for row in self.client.get("/api/memory/entries").json()}
        assert entry_id not in ids

    def test_search_memory(self):
        data = self.client.get(
            "/api/search", params={"q": "pytest", "type": "memory"}
        ).json()
        assert data["query"] == "pytest"
        assert any(r["kind"] == "memory" for r in data["results"])

    def test_provider_status_endpoint_unchanged(self):
        data = self.client.get("/api/memory").json()
        assert "active" in data and "providers" in data
