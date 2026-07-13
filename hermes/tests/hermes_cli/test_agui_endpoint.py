"""Tests for Agent-Marko AG-UI endpoint and SessionDB integration."""

from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

import hermes_cli.web_server as web_server_mod


@pytest.fixture()
def isolated_hermes_home(tmp_path, monkeypatch):
    home = tmp_path / ".hermes"
    home.mkdir()
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setattr("pathlib.Path.home", lambda: tmp_path)
    return home


@pytest.fixture()
def client(isolated_hermes_home):
    with TestClient(web_server_mod.app, raise_server_exceptions=False) as c:
        yield _auth_client(c)


def _auth_client(client: TestClient) -> TestClient:
    client.headers[web_server_mod._SESSION_HEADER_NAME] = web_server_mod._SESSION_TOKEN
    return client


def _session_token() -> str:
    return web_server_mod._SESSION_TOKEN


def _agui_headers(token: str) -> dict:
    return {
        "X-Hermes-Session-Token": token,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
    }


def test_marko_boot_loopback_only(client):
    denied = client.get("/api/marko/boot")
    assert denied.status_code == 403

    # TestClient uses "testclient" host — patch loopback for the dev boot path.
    from starlette.requests import Request

    scope = {
        "type": "http",
        "method": "GET",
        "path": "/api/marko/boot",
        "headers": [],
        "client": ("127.0.0.1", 12345),
    }
    request = Request(scope)
    import asyncio

    body = asyncio.run(web_server_mod.marko_boot(request))
    assert body["backend"] == "hermes"
    assert body["agui"] == "/agui"
    assert body["authRequired"] is False
    assert body["token"] == web_server_mod._SESSION_TOKEN


def test_create_session_persists_marko_row(client):
    token = _session_token()
    resp = client.post(
        "/api/sessions",
        headers={"X-Hermes-Session-Token": token},
        json={"title": "Probe chat"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "Probe chat"
    assert body["id"]
    assert body["groupName"] is None

    listed = client.get(
        "/api/sessions",
        headers={"X-Hermes-Session-Token": token},
        params={"limit": 10, "order": "recent"},
    )
    assert listed.status_code == 200
    rows = listed.json()["sessions"]
    assert any(r["id"] == body["id"] and r.get("source") == "marko" for r in rows)


def test_agui_empty_input_emits_run_error(client):
    token = _session_token()
    with client.stream(
        "POST",
        "/agui",
        headers=_agui_headers(token),
        json={
            "threadId": "empty-thread",
            "runId": "empty-run",
            "messages": [],
        },
    ) as resp:
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")
        lines = [line for line in resp.iter_lines() if line.startswith("data:")]
    assert lines
    first = json.loads(lines[0].removeprefix("data:").strip())
    assert first["type"] == "RUN_STARTED"
    err = json.loads(lines[-1].removeprefix("data:").strip())
    assert err["type"] == "RUN_ERROR"
    assert err["code"] == "empty_input"


def test_agui_creates_session_db_row_before_agent(client):
    token = _session_token()
    thread_id = "agui-session-thread"

    fake_agent = MagicMock()
    fake_agent.run_conversation.return_value = {"final_response": "ok"}

    with patch("run_agent.AIAgent", return_value=fake_agent):
        with client.stream(
            "POST",
            "/agui",
            headers=_agui_headers(token),
            json={
                "threadId": thread_id,
                "runId": "run-1",
                "messages": [{"id": "1", "role": "user", "content": "hello"}],
            },
        ) as resp:
            assert resp.status_code == 200
            _ = list(resp.iter_lines())

    detail = client.get(
        f"/api/sessions/{thread_id}",
        headers={"X-Hermes-Session-Token": token},
    )
    assert detail.status_code == 200
    assert detail.json()["id"] == thread_id
    fake_agent.run_conversation.assert_called_once()


def test_patch_session_returns_marko_dto(client):
    token = _session_token()
    created = client.post(
        "/api/sessions",
        headers={"X-Hermes-Session-Token": token},
        json={"title": "Before"},
    ).json()
    sid = created["id"]

    patched = client.patch(
        f"/api/sessions/{sid}",
        headers={"X-Hermes-Session-Token": token},
        json={"title": "After rename"},
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["id"] == sid
    assert body["title"] == "After rename"
    assert "createdAt" in body
    assert "updatedAt" in body
