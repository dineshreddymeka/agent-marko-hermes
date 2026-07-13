"""Tests for Agent-Marko ``/api/kanban/*`` REST adapter."""

from __future__ import annotations

from pathlib import Path

import pytest
from starlette.testclient import TestClient

from hermes_cli import kanban_db as kb
from hermes_cli.web_server import _SESSION_HEADER_NAME, _SESSION_TOKEN, app


@pytest.fixture
def kanban_home(tmp_path, monkeypatch):
    home = tmp_path / ".hermes"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    kb.init_db()
    return home


@pytest.fixture
def client(kanban_home):
    c = TestClient(app)
    c.headers[_SESSION_HEADER_NAME] = _SESSION_TOKEN
    return c


def test_list_tasks_empty(client):
    r = client.get("/api/kanban/tasks")
    assert r.status_code == 200
    data = r.json()
    assert data["tasks"] == []
    assert data["total"] == 0


def test_status_counts_empty(client):
    r = client.get("/api/kanban/status-counts")
    assert r.status_code == 200
    data = r.json()
    assert data == {
        "triage": 0,
        "todo": 0,
        "ready": 0,
        "running": 0,
        "blocked": 0,
        "done": 0,
        "archived": 0,
    }


def test_create_list_move_delete(client):
    created = client.post(
        "/api/kanban/tasks",
        json={"title": "Ship kanban panel", "body": "Wire REST", "status": "todo"},
    )
    assert created.status_code == 200, created.text
    task = created.json()
    assert task["title"] == "Ship kanban panel"
    assert task["body"] == "Wire REST"
    assert task["status"] == "todo"
    assert task["createdBy"] == "marko"
    assert "createdAt" in task and "updatedAt" in task
    task_id = task["id"]

    listed = client.get("/api/kanban/tasks")
    assert listed.status_code == 200
    assert listed.json()["total"] == 1

    counts = client.get("/api/kanban/status-counts")
    assert counts.status_code == 200
    assert counts.json()["todo"] == 1

    moved = client.post(
        f"/api/kanban/tasks/{task_id}/move",
        json={"status": "done"},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["status"] == "done"

    deleted = client.delete(f"/api/kanban/tasks/{task_id}")
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True

    assert client.get("/api/kanban/tasks").json()["total"] == 0
