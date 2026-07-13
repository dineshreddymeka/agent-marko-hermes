"""Thin REST bridge: Agent-Marko Memory panel ↔ Hermes built-in MEMORY.md / USER.md.

Maps Marko ``MemoryEntry`` DTOs onto the file-backed :class:`tools.memory_tool.MemoryStore`.
Does not use OJ/pgvector. ``GET /api/memory`` remains the Hermes dashboard provider-status
endpoint; Marko uses ``/api/memory/entries`` and ``/api/search?type=memory``.
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from hermes_constants import get_hermes_home
from tools.memory_tool import load_on_disk_store

router = APIRouter(tags=["marko-memory"])

_ENTRY_ID_RE = re.compile(r"^(memory|user)-(\d+)$")
_META_FILENAME = ".panel-meta.json"

MemoryKind = Literal["semantic", "episodic", "preference", "all"]


class MemoryEntryBody(BaseModel):
    kind: MemoryKind = "semantic"
    content: str = ""
    importance: float = Field(default=0.5, ge=0.0, le=1.0)


class MemoryEntryPatch(BaseModel):
    content: Optional[str] = None
    importance: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    kind: Optional[MemoryKind] = None


def _meta_path() -> Path:
    return get_hermes_home() / "memories" / _META_FILENAME


def _load_meta() -> Dict[str, Any]:
    path = _meta_path()
    if not path.exists():
        return {"entries": {}}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"entries": {}}
    if not isinstance(raw, dict):
        return {"entries": {}}
    entries = raw.get("entries")
    if not isinstance(entries, dict):
        raw["entries"] = {}
    return raw


def _save_meta(meta: Dict[str, Any]) -> None:
    path = _meta_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(meta, indent=2), encoding="utf-8")


def _iso_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _file_mtime_iso(path: Path) -> str:
    if not path.exists():
        return _iso_now()
    try:
        return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()
    except OSError:
        return _iso_now()


def _default_kind(target: str) -> str:
    return "preference" if target == "user" else "semantic"


def _kind_to_target(kind: str) -> str:
    if kind == "preference":
        return "user"
    return "memory"


def _parse_entry_id(entry_id: str) -> Tuple[str, int]:
    match = _ENTRY_ID_RE.match(entry_id.strip())
    if not match:
        raise HTTPException(status_code=404, detail="Unknown memory entry id")
    target, index_s = match.group(1), int(match.group(2))
    return target, index_s


def _entry_content(store, target: str, index: int) -> str:
    entries = store._entries_for(target)
    if index < 0 or index >= len(entries):
        raise HTTPException(status_code=404, detail="Memory entry not found")
    return entries[index]


def _entry_to_dto(
    entry_id: str,
    target: str,
    content: str,
    meta: Dict[str, Any],
    *,
    file_path: Path,
) -> Dict[str, Any]:
    row = (meta.get("entries") or {}).get(entry_id) or {}
    kind = row.get("kind") or _default_kind(target)
    importance = row.get("importance")
    if not isinstance(importance, (int, float)):
        importance = 0.5
    created_at = row.get("createdAt") or _file_mtime_iso(file_path)
    last_accessed = row.get("lastAccessed")
    return {
        "id": entry_id,
        "kind": kind,
        "content": content,
        "sourceSession": None,
        "importance": float(importance),
        "createdAt": str(created_at),
        "lastAccessed": str(last_accessed) if last_accessed else None,
    }


def _list_entries(*, kind_filter: str = "all") -> List[Dict[str, Any]]:
    store = load_on_disk_store()
    meta = _load_meta()
    mem_dir = get_hermes_home() / "memories"
    out: List[Dict[str, Any]] = []

    for target in ("memory", "user"):
        default_kind = _default_kind(target)
        if kind_filter not in {"all", default_kind} and not (
            kind_filter == "episodic" and target == "memory"
        ):
            continue
        entries = store._entries_for(target)
        file_path = mem_dir / ("USER.md" if target == "user" else "MEMORY.md")
        for index, content in enumerate(entries):
            entry_id = f"{target}-{index}"
            row = (meta.get("entries") or {}).get(entry_id) or {}
            entry_kind = row.get("kind") or default_kind
            if kind_filter not in {"all", entry_kind}:
                continue
            out.append(
                _entry_to_dto(entry_id, target, content, meta, file_path=file_path)
            )
    return out


def _touch_meta(entry_id: str, **fields: Any) -> None:
    meta = _load_meta()
    entries = meta.setdefault("entries", {})
    row = dict(entries.get(entry_id) or {})
    row.update(fields)
    entries[entry_id] = row
    _save_meta(meta)


def _delete_meta(entry_id: str) -> None:
    meta = _load_meta()
    entries = meta.get("entries") or {}
    if entry_id in entries:
        del entries[entry_id]
        meta["entries"] = entries
        _save_meta(meta)


def _reindex_meta_after_delete(target: str, removed_index: int) -> None:
    """Shift panel metadata ids when an entry is removed from the middle."""
    meta = _load_meta()
    entries: Dict[str, Any] = dict(meta.get("entries") or {})
    if not entries:
        return

    prefix = f"{target}-"
    preserved = {k: v for k, v in entries.items() if not k.startswith(prefix)}

    old_by_index: Dict[int, Any] = {}
    for key, value in entries.items():
        match = _ENTRY_ID_RE.match(key)
        if not match or match.group(1) != target:
            continue
        old_by_index[int(match.group(2))] = value

    for old_index, value in old_by_index.items():
        if old_index == removed_index:
            continue
        new_index = old_index if old_index < removed_index else old_index - 1
        preserved[f"{target}-{new_index}"] = value

    meta["entries"] = preserved
    _save_meta(meta)


def _search_score(query: str, content: str) -> float:
    q = query.casefold()
    text = content.casefold()
    if q not in text:
        return 0.0
    # Simple relevance: shorter snippets with earlier matches score higher.
    pos = text.find(q)
    base = 1.0 - min(pos / max(len(text), 1), 0.9)
    return round(min(1.0, max(0.1, base)), 3)


@router.get("/api/memory/entries")
async def list_memory_entries(kind: str = Query(default="all")):
    kind_norm = (kind or "all").strip().lower()
    if kind_norm not in {"all", "semantic", "episodic", "preference"}:
        raise HTTPException(status_code=400, detail="Invalid kind filter")
    return _list_entries(kind_filter=kind_norm)


@router.post("/api/memory/entries", status_code=201)
async def create_memory_entry(body: MemoryEntryBody):
    content = (body.content or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="content is required")

    kind = (body.kind or "semantic").strip().lower()
    if kind not in {"semantic", "episodic", "preference"}:
        raise HTTPException(status_code=400, detail="Invalid kind")

    target = _kind_to_target(kind)
    store = load_on_disk_store()
    result = store.add(target, content)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error") or "add failed")

    index = len(store._entries_for(target)) - 1
    entry_id = f"{target}-{index}"
    now = _iso_now()
    _touch_meta(
        entry_id,
        kind=kind,
        importance=float(body.importance),
        createdAt=now,
        lastAccessed=now,
    )
    file_path = get_hermes_home() / "memories" / (
        "USER.md" if target == "user" else "MEMORY.md"
    )
    return _entry_to_dto(
        entry_id, target, content, _load_meta(), file_path=file_path
    )


@router.patch("/api/memory/entries/{entry_id}")
async def patch_memory_entry(entry_id: str, body: MemoryEntryPatch):
    target, index = _parse_entry_id(entry_id)
    store = load_on_disk_store()
    old_content = _entry_content(store, target, index)

    new_content = old_content
    if body.content is not None:
        stripped = body.content.strip()
        if not stripped:
            raise HTTPException(status_code=400, detail="content cannot be empty")
        if stripped != old_content:
            result = store.replace(target, old_text=old_content, new_content=stripped)
            if not result.get("success"):
                raise HTTPException(
                    status_code=400, detail=result.get("error") or "replace failed"
                )
            new_content = stripped

    meta_fields: Dict[str, Any] = {"lastAccessed": _iso_now()}
    if body.importance is not None:
        meta_fields["importance"] = float(body.importance)
    if body.kind is not None:
        meta_fields["kind"] = body.kind
    _touch_meta(entry_id, **meta_fields)

    file_path = get_hermes_home() / "memories" / (
        "USER.md" if target == "user" else "MEMORY.md"
    )
    return _entry_to_dto(
        entry_id, target, new_content, _load_meta(), file_path=file_path
    )


@router.delete("/api/memory/entries/{entry_id}")
async def delete_memory_entry(entry_id: str):
    target, index = _parse_entry_id(entry_id)
    store = load_on_disk_store()
    old_content = _entry_content(store, target, index)
    result = store.remove(target, old_text=old_content)
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error") or "remove failed")
    _delete_meta(entry_id)
    _reindex_meta_after_delete(target, index)
    return {"ok": True}


@router.get("/api/search")
async def search_marko(
    q: str = "",
    type: str = Query(default="", alias="type"),
    limit: int = 20,
):
    query = (q or "").strip()
    if not query:
        return {"query": query, "results": []}

    type_norm = (type or "").strip().lower()
    if type_norm and type_norm != "memory":
        return {"query": query, "results": []}

    safe_limit = max(1, min(int(limit or 20), 100))
    hits: List[Dict[str, Any]] = []
    for entry in _list_entries(kind_filter="all"):
        score = _search_score(query, entry["content"])
        if score <= 0:
            continue
        hits.append(
            {
                "kind": "memory",
                "id": entry["id"],
                "snippet": entry["content"][:240],
                "score": score,
            }
        )
    hits.sort(key=lambda row: row.get("score", 0), reverse=True)
    return {"query": query, "results": hits[:safe_limit]}
