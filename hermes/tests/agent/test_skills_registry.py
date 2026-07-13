"""Tests for the durable skills_registry store (state.db)."""

from pathlib import Path

import pytest

from agent.skills_registry import SkillsRegistry, skill_id_for_slug
from hermes_state import SessionDB


def _write_skill(skills_dir: Path, name: str, description: str = "demo") -> Path:
    folder = skills_dir / name
    folder.mkdir(parents=True, exist_ok=True)
    skill_md = folder / "SKILL.md"
    skill_md.write_text(
        f"---\nname: {name}\ndescription: {description}\n---\n\n# {name}\n",
        encoding="utf-8",
    )
    return skill_md


@pytest.fixture
def registry_env(tmp_path, monkeypatch):
    home = tmp_path / ".hermes"
    skills_dir = home / "skills"
    skills_dir.mkdir(parents=True)
    db_path = home / "state.db"
    monkeypatch.setenv("HERMES_HOME", str(home))
    monkeypatch.setattr("tools.skills_tool.HERMES_HOME", home, raising=False)
    monkeypatch.setattr("tools.skills_tool.SKILLS_DIR", skills_dir, raising=False)
    monkeypatch.setattr(
        "tools.skill_manager_tool.HERMES_HOME", home, raising=False
    )
    monkeypatch.setattr(
        "tools.skill_manager_tool.SKILLS_DIR", skills_dir, raising=False
    )

    db = SessionDB(db_path=db_path)
    registry = SkillsRegistry(db=db)
    return registry, skills_dir, home


def test_skill_id_is_stable_uuid():
    a = skill_id_for_slug("my-skill")
    b = skill_id_for_slug("my-skill")
    assert a == b
    assert len(a) == 36


def test_sync_upserts_and_lists(registry_env):
    registry, skills_dir, _home = registry_env
    _write_skill(skills_dir, "alpha", "first skill")

    result = registry.sync_from_disk()
    assert result.synced == 1
    assert result.created == 1

    rows = registry.list_rows()
    assert len(rows) == 1
    row = rows[0]
    assert row["name"] == "alpha"
    assert row["slug"] == "alpha"
    assert row["id"] == skill_id_for_slug("alpha")
    assert row["description"] == "first skill"
    assert row["bodyMd"].startswith("---")
    assert row["missingOnDisk"] is False
    assert row["enabled"] is True


def test_sync_marks_missing_on_disk(registry_env):
    registry, skills_dir, _home = registry_env
    _write_skill(skills_dir, "gone-soon")
    registry.sync_from_disk()

    skill_md = skills_dir / "gone-soon" / "SKILL.md"
    skill_md.unlink()
    (skills_dir / "gone-soon").rmdir()

    result = registry.sync_from_disk()
    assert result.missing == 1
    row = registry.get_by_name("gone-soon")
    assert row is not None
    assert row["missingOnDisk"] is True


def test_toggle_and_meta(registry_env):
    registry, skills_dir, _home = registry_env
    _write_skill(skills_dir, "toggle-me")
    registry.sync_from_disk(disabled_names={"toggle-me"})

    row = registry.get_by_name("toggle-me")
    assert row["enabled"] is False

    registry.set_enabled("toggle-me", True)
    row = registry.get_by_name("toggle-me")
    assert row["enabled"] is True

    meta = registry.meta()
    assert meta["total"] == 1
    assert meta["enabled"] == 1
    assert "skillsDir" in meta


def test_record_write_updates_hash(registry_env):
    registry, skills_dir, _home = registry_env
    path = _write_skill(skills_dir, "writer", "v1")
    registry.sync_from_disk()
    before = registry.get_by_name("writer")
    assert before["contentHash"]

    path.write_text(
        "---\nname: writer\ndescription: v2\n---\n\nupdated\n",
        encoding="utf-8",
    )
    registry.record_write(
        name="writer",
        content=path.read_text(encoding="utf-8"),
        path=str(path),
    )
    after = registry.get_by_name("writer")
    assert after["description"] == "v2"
    assert after["contentHash"] != before["contentHash"]


def test_resolve_ids_for_cron_mcp_links(registry_env):
    registry, skills_dir, _home = registry_env
    _write_skill(skills_dir, "cron-skill")
    registry.sync_from_disk()
    row = registry.get_by_name("cron-skill")
    known, unknown = registry.resolve_ids([row["id"], "missing-uuid"])
    assert len(known) == 1
    assert known[0]["name"] == "cron-skill"
    assert unknown == ["missing-uuid"]
