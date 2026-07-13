"""Skills registry — SQLite index over ``~/.hermes/skills/`` in ``state.db``.

DB is the authoritative index for UI/API retrieval; disk remains the runtime
source for ``skill_view`` and agent loading.  Every mutation writes DB first,
then materializes to disk when applicable.
"""

from __future__ import annotations

import contextlib
import hashlib
import json
import logging
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from hermes_cli.registry_schema import ensure_registry_schema
from hermes_cli.sqlite_util import write_txn
from hermes_constants import get_hermes_home

_log = logging.getLogger(__name__)

_INITIALIZED_PATHS: set[str] = set()
_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9\-_]{0,127}$")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", str(name or "").strip().lower()).strip("-")
    return (s[:128] or "skill")


def _new_skill_id() -> str:
    return "sk_" + secrets.token_hex(8)


def _content_hash(body: str) -> str:
    return hashlib.sha256(body.encode("utf-8")).hexdigest()


def _skills_dir() -> Path:
    return get_hermes_home() / "skills"


def connect(db_path: Optional[Path] = None) -> sqlite3.Connection:
    """Open ``state.db`` with registry tables ensured."""
    from hermes_state import apply_wal_with_fallback
    from hermes_constants import get_hermes_home

    path = db_path if db_path is not None else (get_hermes_home() / "state.db")
    path.parent.mkdir(parents=True, exist_ok=True)
    resolved = str(path.resolve())
    conn = sqlite3.connect(
        str(path),
        check_same_thread=False,
        isolation_level=None,
    )
    conn.row_factory = sqlite3.Row
    apply_wal_with_fallback(conn, db_label="state.db")
    conn.execute("PRAGMA foreign_keys=ON")
    if resolved not in _INITIALIZED_PATHS:
        ensure_registry_schema(conn)
        _INITIALIZED_PATHS.add(resolved)
    return conn


@contextlib.contextmanager
def connect_closing(db_path: Optional[Path] = None):
    conn = connect(db_path=db_path)
    try:
        yield conn
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _parse_frontmatter(content: str) -> Tuple[Dict[str, Any], str]:
    from tools.skills_tool import _parse_frontmatter as _parse

    return _parse(content)


def _detect_source(name: str, skill_md: Path) -> str:
    from tools.skill_usage import is_bundled, is_hub_installed, load_usage

    if is_bundled(name):
        return "builtin"
    usage = load_usage().get(name) or {}
    if usage.get("created_by") == "agent":
        return "learned"
    if is_hub_installed(name):
        return "user-folder"
    prov = usage.get("provenance") or usage.get("source")
    if isinstance(prov, str) and prov.startswith("git:"):
        return prov
    return "user-folder"


def _read_triggers(frontmatter: Dict[str, Any]) -> Optional[List[str]]:
    raw = frontmatter.get("triggers") or frontmatter.get("slash_commands")
    if isinstance(raw, list):
        return [str(x) for x in raw if str(x).strip()]
    if isinstance(raw, str) and raw.strip():
        return [raw.strip()]
    return None


def _usage_counts(name: str) -> Tuple[int, int]:
    from tools.skill_usage import activity_count, load_usage

    rec = load_usage().get(name) or {}
    count = activity_count(rec)
    success = int(rec.get("success_count") or rec.get("use_count") or 0)
    return count, success


def _disabled_names() -> Set[str]:
    from hermes_cli.skills_config import get_disabled_skills, load_config

    try:
        return get_disabled_skills(load_config())
    except Exception:
        return set()


def _row_to_api(row: sqlite3.Row) -> Dict[str, Any]:
    disabled = _disabled_names()
    name = row["name"]
    usage_json = row["usage_json"]
    usage: Dict[str, Any] = {}
    if usage_json:
        try:
            usage = json.loads(usage_json)
        except json.JSONDecodeError:
            pass
    usage_count, success_count = _usage_counts(name)
    triggers = usage.get("triggers")
    disk_path = row["disk_path"]
    return {
        "id": row["id"],
        "name": name,
        "slug": row["slug"],
        "description": row["description"] or "",
        "bodyMd": row["body_md"],
        "source": row["source"],
        "path": disk_path,
        "contentHash": row["content_hash"],
        "triggers": triggers,
        "enabled": name not in disabled and bool(row["enabled"]),
        "lastSyncedAt": row["last_synced_at"],
        "missingOnDisk": bool(row["missing_on_disk"]),
        "usageCount": usage_count,
        "successCount": success_count,
        "createdAt": row["created_at"] or row["last_synced_at"] or _now_iso(),
        "updatedAt": row["updated_at"] or row["last_synced_at"] or _now_iso(),
    }


def list_all() -> List[Dict[str, Any]]:
    with connect_closing() as conn:
        rows = conn.execute(
            "SELECT * FROM skills ORDER BY name COLLATE NOCASE"
        ).fetchall()
    return [_row_to_api(r) for r in rows]


def get_by_id(skill_id: str) -> Optional[Dict[str, Any]]:
    with connect_closing() as conn:
        row = conn.execute(
            "SELECT * FROM skills WHERE id = ?", (skill_id,)
        ).fetchone()
    return _row_to_api(row) if row else None


def get_by_slug(slug: str) -> Optional[Dict[str, Any]]:
    with connect_closing() as conn:
        row = conn.execute(
            "SELECT * FROM skills WHERE slug = ?", (slug,)
        ).fetchone()
    return _row_to_api(row) if row else None


def get_meta() -> Dict[str, Any]:
    with connect_closing() as conn:
        total = conn.execute("SELECT COUNT(*) FROM skills").fetchone()[0]
        missing = conn.execute(
            "SELECT COUNT(*) FROM skills WHERE missing_on_disk = 1"
        ).fetchone()[0]
        last = conn.execute(
            "SELECT MAX(last_synced_at) FROM skills"
        ).fetchone()[0]
    disabled = _disabled_names()
    enabled = 0
    for row in list_all():
        if row["enabled"] and not row["missingOnDisk"]:
            enabled += 1
    return {
        "lastSyncedAt": last,
        "skillsDir": str(_skills_dir()),
        "total": int(total),
        "enabled": enabled,
        "missing": int(missing),
    }


def materialize_to_disk(row: Dict[str, Any]) -> Path:
    """Write ``body_md`` to ``disk_path`` (creating parent dirs)."""
    body = row.get("body_md") or row.get("bodyMd") or ""
    disk_path = row.get("disk_path") or row.get("path")
    if disk_path:
        target = Path(disk_path)
    else:
        slug = row.get("slug") or _slugify(row.get("name", "skill"))
        target = _skills_dir() / slug / "SKILL.md"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body, encoding="utf-8")
    return target


def _scan_disk_skills() -> List[Dict[str, Any]]:
    from agent.skill_utils import get_external_skills_dirs, iter_skill_index_files
    from tools.skills_tool import _EXCLUDED_SKILL_DIRS, _get_category_from_path
    from tools.skills_tool import skill_matches_environment, skill_matches_platform

    found: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    dirs = []
    root = _skills_dir()
    if root.exists():
        dirs.append(root)
    dirs.extend(get_external_skills_dirs())

    for scan_dir in dirs:
        for skill_md in iter_skill_index_files(scan_dir, "SKILL.md"):
            if any(part in _EXCLUDED_SKILL_DIRS for part in skill_md.parts):
                continue
            try:
                content = skill_md.read_text(encoding="utf-8")
            except OSError as exc:
                _log.debug("skip unreadable skill %s: %s", skill_md, exc)
                continue
            frontmatter, _body = _parse_frontmatter(content)
            if not skill_matches_platform(frontmatter):
                continue
            if not skill_matches_environment(frontmatter):
                continue
            name = str(frontmatter.get("name") or skill_md.parent.name)
            if name in seen:
                continue
            seen.add(name)
            description = str(frontmatter.get("description") or "")
            if not description:
                for line in _body.strip().split("\n"):
                    line = line.strip()
                    if line and not line.startswith("#"):
                        description = line
                        break
            triggers = _read_triggers(frontmatter)
            usage_extra: Dict[str, Any] = {}
            if triggers:
                usage_extra["triggers"] = triggers
            found.append(
                {
                    "name": name,
                    "slug": _slugify(name),
                    "description": description,
                    "body_md": content,
                    "content_hash": _content_hash(content),
                    "disk_path": str(skill_md.resolve()),
                    "source": _detect_source(name, skill_md),
                    "usage_json": json.dumps(usage_extra) if usage_extra else None,
                    "category": _get_category_from_path(skill_md),
                }
            )
    return found


def sync_from_disk(*, recreate_missing: bool = False) -> Dict[str, Any]:
    """Scan disk and upsert all skills into DB; mark absent rows missing."""
    disk_skills = _scan_disk_skills()
    disk_slugs = {s["slug"] for s in disk_skills}
    now = _now_iso()
    created = updated = unchanged = recreated = 0

    with connect_closing() as conn:
        with write_txn(conn):
            for skill in disk_skills:
                existing = conn.execute(
                    "SELECT * FROM skills WHERE slug = ?", (skill["slug"],)
                ).fetchone()
                if existing is None:
                    conn.execute(
                        """INSERT INTO skills (
                               id, slug, name, description, body_md, content_hash,
                               disk_path, source, enabled, usage_json,
                               missing_on_disk, last_synced_at, created_at, updated_at
                           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, ?, ?, ?)""",
                        (
                            _new_skill_id(),
                            skill["slug"],
                            skill["name"],
                            skill["description"],
                            skill["body_md"],
                            skill["content_hash"],
                            skill["disk_path"],
                            skill["source"],
                            skill["usage_json"],
                            now,
                            now,
                            now,
                        ),
                    )
                    created += 1
                    continue

                if existing["content_hash"] == skill["content_hash"] and (
                    existing["disk_path"] == skill["disk_path"]
                    and not existing["missing_on_disk"]
                ):
                    conn.execute(
                        """UPDATE skills SET last_synced_at = ?, missing_on_disk = 0,
                               disk_path = ?, description = ? WHERE id = ?""",
                        (now, skill["disk_path"], skill["description"], existing["id"]),
                    )
                    unchanged += 1
                else:
                    conn.execute(
                        """UPDATE skills SET name = ?, description = ?, body_md = ?,
                               content_hash = ?, disk_path = ?, source = ?,
                               usage_json = COALESCE(?, usage_json),
                               missing_on_disk = 0, last_synced_at = ?, updated_at = ?
                           WHERE id = ?""",
                        (
                            skill["name"],
                            skill["description"],
                            skill["body_md"],
                            skill["content_hash"],
                            skill["disk_path"],
                            skill["source"],
                            skill["usage_json"],
                            now,
                            now,
                            existing["id"],
                        ),
                    )
                    updated += 1

            if disk_slugs:
                placeholders = ",".join("?" * len(disk_slugs))
                missing_rows = conn.execute(
                    f"SELECT * FROM skills WHERE slug NOT IN ({placeholders})",
                    list(disk_slugs),
                ).fetchall()
            else:
                missing_rows = conn.execute("SELECT * FROM skills").fetchall()

            missing = 0
            for row in missing_rows:
                missing += 1
                if recreate_missing and row["body_md"]:
                    path = materialize_to_disk(dict(row))
                    conn.execute(
                        """UPDATE skills SET disk_path = ?, missing_on_disk = 0,
                               last_synced_at = ?, updated_at = ? WHERE id = ?""",
                        (str(path), now, now, row["id"]),
                    )
                    recreated += 1
                else:
                    conn.execute(
                        "UPDATE skills SET missing_on_disk = 1, last_synced_at = ?, updated_at = ? WHERE id = ?",
                        (now, now, row["id"]),
                    )

    return {
        "synced": len(disk_skills),
        "created": created,
        "updated": updated,
        "unchanged": unchanged,
        "missing": missing,
        "recreated": recreated,
        "lastSyncedAt": now,
    }


def create_skill(
    *,
    name: str,
    body_md: str,
    description: Optional[str] = None,
    source: str = "user-folder",
    slug: Optional[str] = None,
) -> Dict[str, Any]:
    slug = slug or _slugify(name)
    now = _now_iso()
    content_hash = _content_hash(body_md)
    skill_id = _new_skill_id()
    disk_path = _skills_dir() / slug / "SKILL.md"

    row = {
        "id": skill_id,
        "slug": slug,
        "name": name,
        "description": description or "",
        "body_md": body_md,
        "content_hash": content_hash,
        "disk_path": str(disk_path),
        "source": source,
        "enabled": 1,
        "missing_on_disk": 0,
    }

    with connect_closing() as conn:
        with write_txn(conn):
            conn.execute(
                """INSERT INTO skills (
                       id, slug, name, description, body_md, content_hash,
                       disk_path, source, enabled, missing_on_disk,
                       last_synced_at, created_at, updated_at
                   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)""",
                (
                    skill_id,
                    slug,
                    name,
                    row["description"],
                    body_md,
                    content_hash,
                    str(disk_path),
                    source,
                    now,
                    now,
                    now,
                ),
            )
    materialize_to_disk(row)
    return get_by_id(skill_id) or row


def update_skill(
    skill_id: str,
    *,
    body_md: Optional[str] = None,
    description: Optional[str] = None,
    enabled: Optional[bool] = None,
    name: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    with connect_closing() as conn:
        row = conn.execute(
            "SELECT * FROM skills WHERE id = ?", (skill_id,)
        ).fetchone()
        if not row:
            return None

        now = _now_iso()
        updates: Dict[str, Any] = {"updated_at": now, "last_synced_at": now}
        disk_row = dict(row)

        if body_md is not None:
            updates["body_md"] = body_md
            updates["content_hash"] = _content_hash(body_md)
            disk_row["body_md"] = body_md
        if description is not None:
            updates["description"] = description
        if name is not None:
            updates["name"] = name
        if enabled is not None:
            updates["enabled"] = 1 if enabled else 0
            from hermes_cli.skills_config import (
                get_disabled_skills,
                load_config,
                save_disabled_skills,
            )

            cfg = load_config()
            disabled = get_disabled_skills(cfg)
            skill_name = name or row["name"]
            if enabled:
                disabled.discard(skill_name)
            else:
                disabled.add(skill_name)
            save_disabled_skills(cfg, disabled)

        with write_txn(conn):
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            conn.execute(
                f"UPDATE skills SET {set_clause} WHERE id = ?",
                list(updates.values()) + [skill_id],
            )

            if body_md is not None:
                refreshed = conn.execute(
                    "SELECT * FROM skills WHERE id = ?", (skill_id,)
                ).fetchone()
                if refreshed:
                    path = materialize_to_disk(dict(refreshed))
                    conn.execute(
                        "UPDATE skills SET disk_path = ?, missing_on_disk = 0 WHERE id = ?",
                        (str(path), skill_id),
                    )

    return get_by_id(skill_id)


def delete_skill(skill_id: str, *, remove_disk: bool = True) -> bool:
    with connect_closing() as conn:
        row = conn.execute(
            "SELECT * FROM skills WHERE id = ?", (skill_id,)
        ).fetchone()
        if not row:
            return False
        source = row["source"]
        disk_path = row["disk_path"]
        with write_txn(conn):
            conn.execute("DELETE FROM skills WHERE id = ?", (skill_id,))

    if remove_disk and source not in ("builtin",) and disk_path:
        try:
            path = Path(disk_path)
            if path.exists():
                path.unlink()
            parent = path.parent
            if parent.exists() and not any(parent.iterdir()):
                parent.rmdir()
        except OSError as exc:
            _log.debug("skill disk cleanup failed for %s: %s", disk_path, exc)
    return True


def recreate_on_disk(skill_id: str) -> Optional[Tuple[Dict[str, Any], str]]:
    with connect_closing() as conn:
        row = conn.execute(
            "SELECT * FROM skills WHERE id = ?", (skill_id,)
        ).fetchone()
        if not row:
            return None
        path = materialize_to_disk(dict(row))
        now = _now_iso()
        with write_txn(conn):
            conn.execute(
                """UPDATE skills SET disk_path = ?, missing_on_disk = 0,
                       last_synced_at = ?, updated_at = ? WHERE id = ?""",
                (str(path), now, now, skill_id),
            )
    api = get_by_id(skill_id)
    return (api, str(path)) if api else None


def maybe_bootstrap_from_disk() -> None:
    """One-time import when the skills table is empty."""
    with connect_closing() as conn:
        count = conn.execute("SELECT COUNT(*) FROM skills").fetchone()[0]
    if count == 0:
        sync_from_disk()
