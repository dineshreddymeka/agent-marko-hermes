"""Shared SessionDB + DTO helpers for Agent-Marko (Hermes-direct, no Bun layer)."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Optional


def open_session_db(profile: Optional[str] = None):
    """Open SessionDB for the default or named Hermes profile."""
    from hermes_state import SessionDB

    if not profile:
        return SessionDB()
    from hermes_cli import profiles as profiles_mod

    home = profiles_mod.get_profile_dir(profile)
    return SessionDB(db_path=Path(home) / "state.db")


def marko_session_dto(
    *,
    session_id: str,
    row: Optional[Dict[str, Any]] = None,
    title: Optional[str] = None,
    profile: Optional[str] = None,
) -> Dict[str, Any]:
    """Hermes session row → Agent-Marko ``Session`` JSON shape."""
    data = dict(row or {})
    now_iso = datetime.now(timezone.utc).isoformat()
    started = data.get("started_at")
    last = data.get("last_active", started)

    def _ts_to_iso(value: Any) -> str:
        if isinstance(value, (int, float)):
            return datetime.fromtimestamp(value, tz=timezone.utc).isoformat()
        return now_iso

    resolved_title = (title if title is not None else data.get("title")) or "Untitled"
    return {
        "id": session_id,
        "title": str(resolved_title),
        "groupName": None,
        "profileId": profile,
        "pinned": False,
        "archived": bool(data.get("archived")),
        "createdAt": _ts_to_iso(started),
        "updatedAt": _ts_to_iso(last),
    }


def ensure_marko_session(
    db,
    session_id: str,
    *,
    title: Optional[str] = None,
    source: str = "marko",
) -> Dict[str, Any]:
    """Create session row if missing; optionally set title."""
    existing = None
    try:
        existing = db.get_session(session_id) if hasattr(db, "get_session") else None
    except Exception:
        existing = None
    if not existing:
        try:
            db.create_session(session_id, source=source)
        except Exception:
            pass
    if title:
        try:
            db.set_session_title(session_id, title)
        except Exception:
            pass
    row = None
    try:
        row = db.get_session(session_id)
    except Exception:
        row = None
    return row or {"id": session_id, "title": title or "New chat"}
