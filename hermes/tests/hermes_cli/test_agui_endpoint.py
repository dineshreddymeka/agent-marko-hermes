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


def test_agui_emits_a2ui_custom_from_tool_result(client):
    token = _session_token()
    thread_id = "agui-a2ui-thread"

    fake_agent = MagicMock()

    def _run_conversation(*_args, **_kwargs):
        # Simulate tool callbacks the way AIAgent would.
        # Grab callbacks from the AIAgent constructor kwargs via side_effect below.
        return {"final_response": "Form ready"}

    fake_agent.run_conversation.side_effect = _run_conversation

    captured = {}

    def _agent_factory(*_args, **kwargs):
        captured["kwargs"] = kwargs
        tool_complete = kwargs.get("tool_complete_callback")

        def run(*_a, **_k):
            if tool_complete:
                tool_complete(
                    "tc-a2ui",
                    "a2ui_render",
                    {"surfaceId": "doc-1"},
                    {
                        "content": "Need details",
                        "a2ui": {
                            "surfaceId": "doc-1",
                            "component": {
                                "id": "form",
                                "type": "hermes:DocumentRequestForm",
                                "props": {"topic": "Q1"},
                            },
                            "complete": True,
                        },
                    },
                )
            return {"final_response": "Need details"}

        fake_agent.run_conversation.side_effect = run
        return fake_agent

    with patch("run_agent.AIAgent", side_effect=_agent_factory):
        with client.stream(
            "POST",
            "/agui",
            headers=_agui_headers(token),
            json={
                "threadId": thread_id,
                "runId": "run-a2ui",
                "messages": [{"id": "1", "role": "user", "content": "make a deck"}],
                "forwardedProps": {"profileId": "default"},
            },
        ) as resp:
            assert resp.status_code == 200
            lines = [line for line in resp.iter_lines() if line.startswith("data:")]

    events = [json.loads(line.removeprefix("data:").strip()) for line in lines]
    types = [e.get("type") for e in events]
    assert "RUN_STARTED" in types
    assert "CUSTOM" in types
    custom = next(e for e in events if e.get("type") == "CUSTOM")
    assert custom["name"] == "a2ui.message"
    assert custom["value"]["surfaceId"] == "doc-1"
    assert custom["value"]["component"]["type"] == "hermes:DocumentRequestForm"
    assert custom["value"].get("parentMessageId")
    assert "RUN_FINISHED" in types


def test_agui_action_response_acks_without_agent(client):
    token = _session_token()
    with client.stream(
        "POST",
        "/agui",
        headers=_agui_headers(token),
        json={
            "threadId": "action-thread",
            "runId": "action-run",
            "messages": [
                {
                    "id": "1",
                    "role": "user",
                    "content": "A2UI actionResponse surface=surf-1 action=create_cron data={}",
                }
            ],
            "state": {"a2uiAction": {"surfaceId": "surf-1", "action": "create_cron", "data": {}}},
        },
    ) as resp:
        assert resp.status_code == 200
        lines = [line for line in resp.iter_lines() if line.startswith("data:")]
    events = [json.loads(line.removeprefix("data:").strip()) for line in lines]
    types = [e.get("type") for e in events]
    assert types[0] == "RUN_STARTED"
    assert "TEXT_MESSAGE_CONTENT" in types
    assert types[-1] == "RUN_FINISHED"
    finished = events[-1]
    assert finished["result"]["a2uiAction"]["action"] == "create_cron"


def test_agui_deltas_coalesce_and_flush_before_structural_events(client):
    """C1: many small deltas batch into few SSE events; buffered text always
    flushes before TOOL_CALL_* / TEXT_MESSAGE_END so ordering is preserved."""
    token = _session_token()
    n_deltas = 200
    chunk = "x"

    def _agent_factory(*_args, **kwargs):
        stream = kwargs.get("stream_delta_callback")
        tool_start = kwargs.get("tool_start_callback")
        agent = MagicMock()

        def run(*_a, **_k):
            for _ in range(n_deltas):
                stream(chunk)
            # Structural event mid-stream: buffered deltas must flush first.
            tool_start("tc-1", "noop_tool", {})
            for _ in range(n_deltas):
                stream(chunk)
            return {"final_response": ""}

        agent.run_conversation.side_effect = run
        return agent

    with patch("run_agent.AIAgent", side_effect=_agent_factory):
        with client.stream(
            "POST",
            "/agui",
            headers=_agui_headers(token),
            json={
                "threadId": "coalesce-thread",
                "runId": "run-coalesce",
                "messages": [{"id": "1", "role": "user", "content": "stream a lot"}],
            },
        ) as resp:
            assert resp.status_code == 200
            lines = [line for line in resp.iter_lines() if line.startswith("data:")]

    events = [json.loads(line.removeprefix("data:").strip()) for line in lines]
    types = [e.get("type") for e in events]

    # No token lost to batching.
    total_text = "".join(
        e["delta"] for e in events if e.get("type") == "TEXT_MESSAGE_CONTENT"
    )
    assert total_text == chunk * (2 * n_deltas)

    # Coalescing happened: far fewer content events than deltas.
    n_content = types.count("TEXT_MESSAGE_CONTENT")
    assert n_content < n_deltas  # 400 deltas → ≤ ~a few dozen events

    # Ordering: all content before the tool call arrived on the wire before
    # TOOL_CALL_START (flush-before-structural-event invariant).
    tool_idx = types.index("TOOL_CALL_START")
    text_before = "".join(
        e["delta"]
        for e in events[:tool_idx]
        if e.get("type") == "TEXT_MESSAGE_CONTENT"
    )
    assert len(text_before) == n_deltas

    # END events follow all content; run finishes.
    assert types.index("TEXT_MESSAGE_END") > max(
        i for i, t in enumerate(types) if t == "TEXT_MESSAGE_CONTENT"
    )
    assert types[-1] == "RUN_FINISHED"
    assert types[0] == "RUN_STARTED"


def test_delta_coalescer_unit():
    from hermes_cli.agui_endpoint import _DeltaCoalescer

    out = []
    co = _DeltaCoalescer(out.append, "TEXT_MESSAGE_CONTENT", "m1")

    # Below window + below MAX_CHARS: buffered, nothing emitted.
    co.add("ab")
    assert out == [] or len(out) <= 1  # window race tolerated
    co.flush()
    joined = "".join(e["delta"] for e in out)
    assert joined == "ab"

    # MAX_CHARS forces immediate flush.
    out.clear()
    co.add("y" * _DeltaCoalescer.MAX_CHARS)
    assert len(out) == 1 and out[0]["delta"] == "y" * _DeltaCoalescer.MAX_CHARS

    # flush() on empty buffer is a no-op.
    out.clear()
    co.flush()
    assert out == []


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
