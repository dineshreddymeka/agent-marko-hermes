"""Tests for OpenAPI-derived Marko capabilities manifest."""

from __future__ import annotations

from hermes_cli.marko_capabilities import _feature_flags


def test_feature_flags_from_openapi_paths():
    paths = {
        "/agui",
        "/api/sessions",
        "/api/sessions/{session_id}",
        "/api/fs/list",
        "/api/cron/jobs",
        "/api/memory/entries",
        "/api/mcp/servers",
        "/api/skills",
        "/api/profiles",
        "/api/kanban/tasks",
        "/api/search",
    }
    flags = _feature_flags(paths)
    assert flags["agui"] is True
    assert flags["a2ui"] is True
    assert flags["sessions"] is True
    assert flags["workspace"] is True
    assert flags["cron"] is True
    assert flags["approval"] is False
    assert flags["cowork"] is False
    assert flags["office"] is False


def test_feature_flags_empty_openapi():
    flags = _feature_flags(set())
    assert flags["agui"] is False
    assert flags["a2ui"] is False
    assert flags["sessions"] is False
