"""Agent-Marko Kanban REST adapter — ``/api/kanban/*``.

Thin wrapper around ``hermes_cli.kanban_db`` (same store as the Hermes kanban
plugin at ``/api/plugins/kanban/*``). Serializes Hermes task rows into the
camelCase DTOs defined in ``packages/shared/src/api-types.ts``.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from hermes_cli import kanban_db as kb

_log = logging.getLogger("hermes.marko_kanban")

router = APIRouter(prefix="/api/kanban", tags=["marko-kanban"])

# Marko panel columns (subset of Hermes VALID_STATUSES).
_MARKO_STATUSES = frozenset(
    {"triage", "todo", "ready", "running", "blocked", "done", "archived"}
)

# Hermes-only columns surfaced in Marko's nearest bucket for list rendering.
_STATUS_DISPLAY_MAP: dict[str, str] = {
    "scheduled": "todo",
    "review": "ready",
}


def _conn():
    try:
        kb.init_db()
    except Exception as exc:
        _log.warning("kanban init_db failed: %s", exc)
    return kb.connect()


def _epoch_to_iso(value: Optional[int]) -> Optional[str]:
    if value is None:
        return None
    try:
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(value)))
    except (TypeError, ValueError, OSError):
        return None


def _latest_block_reason(conn, task_id: str) -> Optional[str]:
    row = conn.execute(
        "SELECT payload FROM task_events "
        "WHERE task_id = ? AND kind = 'blocked' "
        "ORDER BY id DESC LIMIT 1",
        (task_id,),
    ).fetchone()
    if not row or not row["payload"]:
        return None
    try:
        payload = json.loads(row["payload"])
    except Exception:
        return None
    if isinstance(payload, dict):
        reason = payload.get("reason")
        return str(reason) if reason else None
    return None


def _task_to_dto(
    conn,
    task: kb.Task,
    *,
    summary: Optional[str] = None,
) -> dict[str, Any]:
    display_status = _STATUS_DISPLAY_MAP.get(task.status, task.status)
    if display_status not in _MARKO_STATUSES:
        display_status = "todo"

    updated_ts = task.completed_at or task.started_at or task.created_at
    block_kind = task.block_kind if task.block_kind in kb.VALID_BLOCK_KINDS else None

    return {
        "id": task.id,
        "title": task.title,
        "body": task.body,
        "status": display_status,
        "priority": int(task.priority or 0),
        "assignee": task.assignee,
        "createdBy": task.created_by,
        "blockKind": block_kind,
        "blockReason": _latest_block_reason(conn, task.id) if task.status == "blocked" else None,
        "result": task.result,
        "summary": summary,
        "metadata": {},
        "sessionId": task.session_id,
        "runId": str(task.current_run_id) if task.current_run_id is not None else None,
        "createdAt": _epoch_to_iso(task.created_at) or "",
        "updatedAt": _epoch_to_iso(updated_ts) or _epoch_to_iso(task.created_at) or "",
        "startedAt": _epoch_to_iso(task.started_at),
        "completedAt": _epoch_to_iso(task.completed_at),
    }


def _set_status_direct(conn, task_id: str, new_status: str) -> bool:
    """Direct status write for Marko drag-drop moves (todo/ready/triage)."""
    if new_status not in kb.VALID_STATUSES:
        return False
    with kb.write_txn(conn):
        prev = conn.execute(
            "SELECT status, current_run_id FROM tasks WHERE id = ?",
            (task_id,),
        ).fetchone()
        if prev is None:
            return False
        if new_status == "ready":
            parent_statuses = conn.execute(
                "SELECT t.status FROM tasks t "
                "JOIN task_links l ON l.parent_id = t.id "
                "WHERE l.child_id = ?",
                (task_id,),
            ).fetchall()
            if parent_statuses and not all(p["status"] == "done" for p in parent_statuses):
                return False

        was_running = prev["status"] == "running"
        cur = conn.execute(
            "UPDATE tasks SET status = ?, "
            "  claim_lock = CASE WHEN ? = 'running' THEN claim_lock ELSE NULL END, "
            "  claim_expires = CASE WHEN ? = 'running' THEN claim_expires ELSE NULL END, "
            "  worker_pid = CASE WHEN ? = 'running' THEN worker_pid ELSE NULL END "
            "WHERE id = ?",
            (new_status, new_status, new_status, new_status, task_id),
        )
        if cur.rowcount != 1:
            return False
        run_id = None
        if was_running and new_status != "running" and prev["current_run_id"]:
            run_id = kb._end_run(
                conn,
                task_id,
                outcome="reclaimed",
                status="reclaimed",
                summary=f"status changed to {new_status} (marko)",
            )
        conn.execute(
            "INSERT INTO task_events (task_id, run_id, kind, payload, created_at) "
            "VALUES (?, ?, 'status', ?, ?)",
            (task_id, run_id, json.dumps({"status": new_status}), int(time.time())),
        )
    if new_status in {"done", "ready"}:
        kb.recompute_ready(conn)
    return True


def _move_task(conn, task_id: str, new_status: str) -> bool:
    if new_status not in _MARKO_STATUSES:
        raise HTTPException(status_code=400, detail=f"unknown status: {new_status}")
    if new_status == "running":
        raise HTTPException(
            status_code=400,
            detail="Cannot set status to 'running' directly; use the dispatcher",
        )

    task = kb.get_task(conn, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=f"task {task_id} not found")

    if new_status == "done":
        ok = kb.complete_task(conn, task_id)
    elif new_status == "blocked":
        ok = kb.block_task(conn, task_id)
    elif new_status == "archived":
        ok = kb.archive_task(conn, task_id)
    elif new_status == "ready":
        if task.status in ("blocked", "scheduled"):
            ok = kb.unblock_task(conn, task_id)
        else:
            ok = _set_status_direct(conn, task_id, "ready")
    elif new_status in ("todo", "triage"):
        ok = _set_status_direct(conn, task_id, new_status)
    else:
        ok = _set_status_direct(conn, task_id, new_status)

    if not ok:
        raise HTTPException(
            status_code=409,
            detail=f"status transition to {new_status!r} not valid from current state",
        )
    return True


class CreateKanbanTaskBody(BaseModel):
    title: str
    body: Optional[str] = None
    status: str = "todo"
    priority: int = 0
    assignee: Optional[str] = None


class MoveKanbanTaskBody(BaseModel):
    status: str


@router.get("/tasks")
def list_kanban_tasks(
    include_archived: bool = Query(False, alias="includeArchived"),
    limit: int = Query(200, ge=1, le=500),
):
    conn = _conn()
    try:
        tasks = kb.list_tasks(
            conn,
            include_archived=include_archived,
            limit=limit,
        )
        summaries = kb.latest_summaries(conn, [t.id for t in tasks])
        dtos = [_task_to_dto(conn, t, summary=summaries.get(t.id)) for t in tasks]
        return {"tasks": dtos, "total": len(dtos)}
    finally:
        conn.close()


@router.get("/status-counts")
def kanban_status_counts():
    conn = _conn()
    try:
        counts = {s: 0 for s in _MARKO_STATUSES}
        for row in conn.execute(
            "SELECT status, COUNT(*) AS n FROM tasks GROUP BY status"
        ):
            status = row["status"]
            bucket = _STATUS_DISPLAY_MAP.get(status, status)
            if bucket in counts:
                counts[bucket] += int(row["n"])
        return counts
    finally:
        conn.close()


@router.post("/tasks")
def create_kanban_task(body: CreateKanbanTaskBody):
    title = (body.title or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    status = (body.status or "todo").strip().lower()
    if status not in _MARKO_STATUSES:
        raise HTTPException(status_code=400, detail=f"unknown status: {status}")

    conn = _conn()
    try:
        task_id = kb.create_task(
            conn,
            title=title,
            body=body.body,
            assignee=body.assignee,
            created_by="marko",
            priority=int(body.priority or 0),
            triage=(status == "triage"),
        )
        if status == "todo":
            _set_status_direct(conn, task_id, "todo")
        elif status not in ("ready", "triage"):
            _move_task(conn, task_id, status)

        task = kb.get_task(conn, task_id)
        if task is None:
            raise HTTPException(status_code=500, detail="task creation failed")
        summary = kb.latest_summary(conn, task_id)
        return _task_to_dto(conn, task, summary=summary)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        conn.close()


@router.post("/tasks/{task_id}/move")
def move_kanban_task(task_id: str, body: MoveKanbanTaskBody):
    conn = _conn()
    try:
        _move_task(conn, task_id, (body.status or "").strip().lower())
        task = kb.get_task(conn, task_id)
        if task is None:
            raise HTTPException(status_code=404, detail=f"task {task_id} not found")
        summary = kb.latest_summary(conn, task_id)
        return _task_to_dto(conn, task, summary=summary)
    finally:
        conn.close()


@router.delete("/tasks/{task_id}")
def delete_kanban_task(task_id: str):
    conn = _conn()
    try:
        ok = kb.delete_task(conn, task_id)
        if not ok:
            raise HTTPException(status_code=404, detail=f"task {task_id} not found")
        return {"deleted": True}
    finally:
        conn.close()
