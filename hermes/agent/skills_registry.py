"""Durable skills registry backed by SessionDB (state.db).

Schema (skills_registry table, SCHEMA_VERSION 21):
  id TEXT PRIMARY KEY           -- stable UUIDv5 from slug (cron/MCP links)
  name TEXT NOT NULL            -- frontmatter name
  slug TEXT NOT NULL UNIQUE     -- disk folder identity / upsert key
  description TEXT
  body_md TEXT                  -- cached SKILL.md body
  source TEXT                   -- builtin | user-folder | git:hub | learned
  path TEXT                     -- absolute SKILL.md path when present
  content_hash TEXT             -- SHA-256 of body_md
  triggers_json TEXT            -- optional JSON array
  enabled INTEGER                 -- 1/0 (mirrors config disabled set)
  last_synced_at REAL
  missing_on_disk INTEGER       -- 1 when DB row has no file
  usage_count INTEGER
  success_count INTEGER
  category TEXT
  provenance TEXT               -- hub | bundled | agent
  created_at REAL
  updated_at REAL

Sync contract:
  - list/sync scans ~/.hermes/skills (+ external dirs) for SKILL.md
  - upsert by slug; refresh hash/body when file changed
  - rows with no matching disk file -> missing_on_disk=1
  - orphan disk-only skills get new rows on sync
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

from hermes_constants import get_hermes_home
from hermes_state import SessionDB

logger = logging.getLogger(__name__)

SKILL_ID_NAMESPACE = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")


def _now() -> float:
    return time.time()


def _iso(ts: Optional[float]) -> Optional[str]:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def skill_id_for_slug(slug: str) -> str:
    return str(uuid.uuid5(SKILL_ID_NAMESPACE, slug.strip().lower()))


def _slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "skill"


def _sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _provenance_to_source(provenance: str, learned: bool = False) -> str:
    if learned:
        return "learned"
    if provenance == "bundled":
        return "builtin"
    if provenance == "hub":
        return "git:hub"
    return "user-folder"


@dataclass
class SyncResult:
    synced: int = 0
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    missing: int = 0
    recreated: int = 0
    last_synced_at: str = ""

    def as_dict(self) -> Dict[str, Any]:
        return {
            "synced": self.synced,
            "created": self.created,
            "updated": self.updated,
            "unchanged": self.unchanged,
            "missing": self.missing,
            "recreated": self.recreated,
            "lastSyncedAt": self.last_synced_at,
        }


class SkillsRegistry:
    """CRUD + disk sync for skills_registry rows."""

    META_LAST_SYNC_KEY = "skills_last_synced_at"

    def __init__(self, db: Optional[SessionDB] = None, db_path: Optional[Path] = None):
        if db is not None:
            self._db = db
        elif db_path is not None:
            self._db = SessionDB(db_path=db_path)
        else:
            self._db = SessionDB()

    def _conn(self):
        return self._db._conn

    def _set_meta(self, key: str, value: str) -> None:
        now = _now()
        self._conn().execute(
            "INSERT INTO state_meta(key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        self._conn().commit()

    def _get_meta(self, key: str) -> Optional[str]:
        row = self._conn().execute(
            "SELECT value FROM state_meta WHERE key = ?", (key,)
        ).fetchone()
        if not row:
            return None
        return row[0] if isinstance(row, tuple) else row["value"]

    def list_rows(self) -> List[Dict[str, Any]]:
        rows = self._conn().execute(
            "SELECT * FROM skills_registry ORDER BY name COLLATE NOCASE"
        ).fetchall()
        return [self._row_to_api(dict(r)) for r in rows]

    def get_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        row = self._conn().execute(
            "SELECT * FROM skills_registry WHERE name = ? OR slug = ?",
            (name, _slugify(name)),
        ).fetchone()
        return self._row_to_api(dict(row)) if row else None

    def get_by_id(self, skill_id: str) -> Optional[Dict[str, Any]]:
        row = self._conn().execute(
            "SELECT * FROM skills_registry WHERE id = ?", (skill_id,)
        ).fetchone()
        return self._row_to_api(dict(row)) if row else None

    def resolve_ids(self, skill_ids: List[str]) -> Tuple[List[Dict[str, str]], List[str]]:
        """Return (known [{id,name}], unknown_ids) for cron/MCP wizard validation."""
        known: List[Dict[str, str]] = []
        unknown: List[str] = []
        for raw in skill_ids:
            sid = (raw or "").strip()
            if not sid:
                continue
            row = self.get_by_id(sid) or self.get_by_name(sid)
            if row:
                known.append({"id": row["id"], "name": row["name"]})
            else:
                unknown.append(sid)
        return known, unknown

    def get_content(self, name: str) -> Optional[Dict[str, Any]]:
        row = self.get_by_name(name)
        if not row:
            return None
        return {
            "name": row["name"],
            "content": row["bodyMd"],
            "path": row["path"] or "",
        }

    def set_enabled(self, name: str, enabled: bool) -> bool:
        cur = self._conn().execute(
            "UPDATE skills_registry SET enabled = ?, updated_at = ? "
            "WHERE name = ? OR slug = ?",
            (1 if enabled else 0, _now(), name, _slugify(name)),
        )
        self._conn().commit()
        return cur.rowcount > 0

    def delete_row(self, name: str) -> bool:
        cur = self._conn().execute(
            "DELETE FROM skills_registry WHERE name = ? OR slug = ?",
            (name, _slugify(name)),
        )
        self._conn().commit()
        return cur.rowcount > 0

    def upsert_from_scan(
        self,
        *,
        name: str,
        slug: str,
        description: str,
        body_md: str,
        path: Optional[str],
        source: str,
        provenance: str,
        category: Optional[str],
        enabled: bool,
        usage_count: int = 0,
        success_count: int = 0,
        triggers: Optional[List[str]] = None,
        learned: bool = False,
    ) -> Tuple[str, bool]:
        """Insert or update a row. Returns (action, skill_id) where action is created|updated|unchanged."""
        now = _now()
        skill_id = skill_id_for_slug(slug)
        content_hash = _sha256(body_md) if body_md else None
        triggers_json = json.dumps(triggers) if triggers else None
        source_val = _provenance_to_source(provenance, learned=learned)

        existing = self._conn().execute(
            "SELECT id, content_hash, body_md, missing_on_disk FROM skills_registry WHERE slug = ?",
            (slug,),
        ).fetchone()

        if existing is None:
            self._conn().execute(
                """
                INSERT INTO skills_registry (
                    id, name, slug, description, body_md, source, path, content_hash,
                    triggers_json, enabled, last_synced_at, missing_on_disk,
                    usage_count, success_count, category, provenance, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
                """,
                (
                    skill_id,
                    name,
                    slug,
                    description,
                    body_md,
                    source_val,
                    path,
                    content_hash,
                    triggers_json,
                    1 if enabled else 0,
                    now,
                    usage_count,
                    success_count,
                    category,
                    provenance,
                    now,
                    now,
                ),
            )
            self._conn().commit()
            return "created", skill_id

        ex = dict(existing)
        old_hash = ex.get("content_hash")
        was_missing = bool(ex.get("missing_on_disk"))
        changed = (
            old_hash != content_hash
            or was_missing
            or ex.get("body_md") != body_md
        )
        action = "updated" if changed or was_missing else "unchanged"
        self._conn().execute(
            """
            UPDATE skills_registry SET
                name = ?, description = ?, body_md = ?, source = ?, path = ?,
                content_hash = ?, triggers_json = ?, enabled = ?, last_synced_at = ?,
                missing_on_disk = 0, usage_count = ?, success_count = ?,
                category = ?, provenance = ?, updated_at = ?
            WHERE slug = ?
            """,
            (
                name,
                description,
                body_md,
                source_val,
                path,
                content_hash,
                triggers_json,
                1 if enabled else 0,
                now,
                usage_count,
                success_count,
                category,
                provenance,
                now,
                slug,
            ),
        )
        self._conn().commit()
        return action, ex.get("id") or skill_id

    def mark_missing_except(self, seen_slugs: Set[str]) -> int:
        now = _now()
        rows = self._conn().execute("SELECT slug FROM skills_registry").fetchall()
        missing = 0
        for row in rows:
            slug = row[0] if isinstance(row, tuple) else row["slug"]
            if slug not in seen_slugs:
                self._conn().execute(
                    "UPDATE skills_registry SET missing_on_disk = 1, updated_at = ?, "
                    "path = NULL WHERE slug = ?",
                    (now, slug),
                )
                missing += 1
        if missing:
            self._conn().commit()
        return missing

    def sync_from_disk(self, disabled_names: Optional[Set[str]] = None) -> SyncResult:
        from tools.skills_tool import _parse_frontmatter
        from agent.skill_utils import get_external_skills_dirs, iter_skill_index_files, is_excluded_skill_path
        from tools import skills_tool as skills_tool_mod
        from tools.skill_usage import (
            activity_count,
            load_usage,
            provenance as skill_provenance,
            is_agent_created,
        )

        disabled = disabled_names or set()
        usage = load_usage()
        result = SyncResult()
        seen_slugs: Set[str] = set()
        now = _now()

        skills_dir = skills_tool_mod._skills_dir()
        dirs_to_scan: List[Path] = []
        if skills_dir.exists():
            dirs_to_scan.append(skills_dir)
        dirs_to_scan.extend(get_external_skills_dirs())

        for scan_dir in dirs_to_scan:
            for skill_md in iter_skill_index_files(scan_dir, "SKILL.md"):
                if is_excluded_skill_path(skill_md):
                    continue
                try:
                    raw = skill_md.read_text(encoding="utf-8")
                except (OSError, UnicodeDecodeError):
                    continue
                frontmatter, _body = _parse_frontmatter(raw)
                name = str(frontmatter.get("name") or skill_md.parent.name)
                slug = _slugify(name)
                if slug in seen_slugs:
                    continue
                seen_slugs.add(slug)

                description = str(frontmatter.get("description") or "")
                if not description.strip():
                    for line in raw.splitlines():
                        line = line.strip()
                        if line and not line.startswith("#") and not line.startswith("---"):
                            description = line
                            break

                category = None
                try:
                    rel = skill_md.relative_to(scan_dir)
                    if len(rel.parts) >= 3:
                        category = rel.parts[0]
                except ValueError:
                    pass

                prov = skill_provenance(name)
                learned = is_agent_created(name)
                u = usage.get(name, {})
                action, _ = self.upsert_from_scan(
                    name=name,
                    slug=slug,
                    description=description[:500],
                    body_md=raw,
                    path=str(skill_md),
                    source=_provenance_to_source(prov, learned=learned),
                    provenance=prov,
                    category=category,
                    enabled=name not in disabled,
                    usage_count=activity_count(u),
                    success_count=int(u.get("success_count") or 0),
                    triggers=_parse_triggers(frontmatter),
                    learned=learned,
                )
                result.synced += 1
                if action == "created":
                    result.created += 1
                elif action == "updated":
                    result.updated += 1
                else:
                    result.unchanged += 1

        result.missing = self.mark_missing_except(seen_slugs)
        result.last_synced_at = _iso(now) or ""
        self._set_meta(self.META_LAST_SYNC_KEY, str(now))
        return result

    def record_write(
        self,
        *,
        name: str,
        content: str,
        path: Optional[str],
        provenance: str = "agent",
        category: Optional[str] = None,
        enabled: bool = True,
    ) -> str:
        slug = _slugify(name)
        frontmatter, _ = _parse_frontmatter_safe(content)
        description = str(frontmatter.get("description") or "")
        action, skill_id = self.upsert_from_scan(
            name=name,
            slug=slug,
            description=description,
            body_md=content,
            path=path,
            source=_provenance_to_source(provenance),
            provenance=provenance,
            category=category,
            enabled=enabled,
            triggers=_parse_triggers(frontmatter),
        )
        return skill_id

    def meta(self) -> Dict[str, Any]:
        from tools import skills_tool as skills_tool_mod

        rows = self._conn().execute(
            "SELECT enabled, missing_on_disk FROM skills_registry"
        ).fetchall()
        total = len(rows)
        enabled = sum(1 for r in rows if (r[0] if isinstance(r, tuple) else r["enabled"]))
        missing = sum(
            1 for r in rows if (r[1] if isinstance(r, tuple) else r["missing_on_disk"])
        )
        last_raw = self._get_meta(self.META_LAST_SYNC_KEY)
        last_synced = _iso(float(last_raw)) if last_raw else None
        skills_dir = str(skills_tool_mod._skills_dir())
        return {
            "lastSyncedAt": last_synced,
            "skillsDir": skills_dir,
            "total": total,
            "enabled": enabled,
            "missing": missing,
        }

    def _row_to_api(self, row: Dict[str, Any]) -> Dict[str, Any]:
        triggers = None
        raw_triggers = row.get("triggers_json")
        if raw_triggers:
            try:
                triggers = json.loads(raw_triggers)
            except json.JSONDecodeError:
                triggers = None
        return {
            "id": row["id"],
            "name": row["name"],
            "slug": row["slug"],
            "description": row.get("description") or "",
            "bodyMd": row.get("body_md") or "",
            "source": row.get("source") or "user-folder",
            "path": row.get("path"),
            "contentHash": row.get("content_hash"),
            "triggers": triggers,
            "enabled": bool(row.get("enabled", 1)),
            "lastSyncedAt": _iso(row.get("last_synced_at")),
            "missingOnDisk": bool(row.get("missing_on_disk", 0)),
            "usageCount": int(row.get("usage_count") or 0),
            "successCount": int(row.get("success_count") or 0),
            "category": row.get("category"),
            "provenance": row.get("provenance"),
            "createdAt": _iso(row.get("created_at")) or "",
            "updatedAt": _iso(row.get("updated_at")) or "",
        }


def _parse_frontmatter_safe(content: str) -> Tuple[Dict[str, Any], str]:
    from agent.skill_utils import parse_frontmatter

    try:
        return parse_frontmatter(content)
    except Exception:
        return {}, content


def _parse_triggers(frontmatter: Dict[str, Any]) -> Optional[List[str]]:
    raw = frontmatter.get("triggers")
    if raw is None:
        return None
    if isinstance(raw, list):
        return [str(x) for x in raw]
    if isinstance(raw, str) and raw.strip():
        return [t.strip() for t in raw.split(",") if t.strip()]
    return None


def get_skills_registry(db_path: Optional[Path] = None) -> SkillsRegistry:
    if db_path is None:
        return SkillsRegistry()
    return SkillsRegistry(db_path=db_path)
