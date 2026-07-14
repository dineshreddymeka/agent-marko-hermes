"""Tests for Marko Next.js web UI build helpers.

Critical invariant: the Marko Next export lands in hermes_cli/web_dist/
(via ui/scripts/copy-web-dist.mjs), NOT ui/out/ at runtime. The sentinel
must be checked in the correct output directory or the freshness check
is a no-op and the rebuild always runs.
"""

import os
import time
from pathlib import Path
from unittest.mock import patch

from hermes_cli.main import (
    _web_ui_build_needed,
    _build_web_ui,
    _marko_ui_layout,
    _run_npm_install_deterministic,
)


def _touch(path: Path, offset: float = 0.0) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.touch()
    if offset:
        t = time.time() + offset
        os.utime(path, (t, t))


def _make_marko_layout(tmp_path: Path) -> tuple[Path, Path, Path, Path]:
    """Return (hermes_root, monorepo, ui_dir, dist_dir) matching real layout."""
    monorepo = tmp_path
    (monorepo / "package.json").write_text(
        '{"name":"agent-marko-hermes","scripts":{"build:ui":"npm run build -w app"}}',
        encoding="utf-8",
    )
    ui_dir = monorepo / "ui"
    ui_dir.mkdir()
    (ui_dir / "package.json").write_text('{"name":"app"}', encoding="utf-8")
    hermes_root = monorepo / "hermes"
    hermes_root.mkdir()
    dist_dir = hermes_root / "hermes_cli" / "web_dist"
    return hermes_root, monorepo, ui_dir, dist_dir


class TestMarkoUiLayout:
    def test_resolves_sibling_ui(self, tmp_path):
        hermes_root, monorepo, ui_dir, dist_dir = _make_marko_layout(tmp_path)
        assert _marko_ui_layout(hermes_root) == (monorepo, ui_dir, dist_dir)

    def test_returns_none_without_ui(self, tmp_path):
        hermes_root = tmp_path / "hermes"
        hermes_root.mkdir()
        (tmp_path / "package.json").write_text("{}", encoding="utf-8")
        assert _marko_ui_layout(hermes_root) is None


class TestWebUIBuildNeeded:
    def test_returns_true_when_dist_missing(self, tmp_path):
        _, _, ui_dir, dist_dir = _make_marko_layout(tmp_path)
        assert _web_ui_build_needed(ui_dir, dist_dir) is True

    def test_returns_false_when_index_fresh(self, tmp_path):
        _, _, ui_dir, dist_dir = _make_marko_layout(tmp_path)
        _touch(ui_dir / "src" / "App.tsx", offset=-10)
        _touch(dist_dir / "index.html")
        assert _web_ui_build_needed(ui_dir, dist_dir) is False

    def test_returns_true_when_source_newer_than_index(self, tmp_path):
        _, _, ui_dir, dist_dir = _make_marko_layout(tmp_path)
        _touch(dist_dir / "index.html", offset=-10)
        _touch(ui_dir / "src" / "App.tsx")
        assert _web_ui_build_needed(ui_dir, dist_dir) is True

    def test_returns_true_when_next_config_newer(self, tmp_path):
        _, _, ui_dir, dist_dir = _make_marko_layout(tmp_path)
        _touch(dist_dir / "index.html", offset=-10)
        _touch(ui_dir / "next.config.ts")
        assert _web_ui_build_needed(ui_dir, dist_dir) is True

    def test_returns_true_when_root_lockfile_newer(self, tmp_path):
        _, monorepo, ui_dir, dist_dir = _make_marko_layout(tmp_path)
        _touch(dist_dir / "index.html", offset=-10)
        _touch(monorepo / "package-lock.json")
        assert _web_ui_build_needed(ui_dir, dist_dir) is True

    def test_ignores_node_modules_and_out(self, tmp_path):
        _, monorepo, ui_dir, dist_dir = _make_marko_layout(tmp_path)
        _touch(ui_dir / "package.json", offset=-20)
        _touch(monorepo / "package.json", offset=-20)
        _touch(dist_dir / "index.html", offset=-10)
        _touch(ui_dir / "node_modules" / "react" / "index.js")
        _touch(ui_dir / "out" / "index.html")
        assert _web_ui_build_needed(ui_dir, dist_dir) is False


class TestBuildWebUISkipsWhenFresh:
    def test_skips_npm_when_dist_is_fresh(self, tmp_path):
        hermes_root, _, ui_dir, dist_dir = _make_marko_layout(tmp_path)
        _touch(ui_dir / "src" / "App.tsx", offset=-10)
        _touch(dist_dir / "index.html")

        with patch("hermes_cli.main.shutil.which", return_value="/usr/bin/npm"), \
             patch("hermes_cli.main.subprocess.run") as mock_run:
            result = _build_web_ui(hermes_root)

        assert result is True
        mock_run.assert_not_called()

    def test_runs_npm_when_dist_missing(self, tmp_path):
        hermes_root, monorepo, _, _ = _make_marko_layout(tmp_path)

        mock_cp = __import__("subprocess").CompletedProcess([], 0, stdout="", stderr="")
        build_ok = __import__("subprocess").CompletedProcess([], 0, stdout="", stderr="")
        with patch("hermes_cli.main.shutil.which", return_value="/usr/bin/npm"), \
             patch("hermes_cli.main.subprocess.run", return_value=mock_cp) as mock_run, \
             patch("hermes_cli.main._run_with_idle_timeout", return_value=build_ok) as mock_idle, \
             patch("hermes_constants.find_node_executable", return_value="/usr/bin/npm"):
            result = _build_web_ui(hermes_root)

        assert result is True
        assert mock_run.call_count == 1
        assert mock_idle.call_count == 1
        idle_args, idle_kwargs = mock_idle.call_args
        assert idle_args[0] == ["/usr/bin/npm", "run", "build:ui"]
        assert idle_kwargs["cwd"] == monorepo

    def test_skips_when_no_marko_ui_and_dist_exists(self, tmp_path):
        hermes_root = tmp_path / "hermes"
        dist = hermes_root / "hermes_cli" / "web_dist"
        _touch(dist / "index.html")
        assert _build_web_ui(hermes_root) is True

    def test_fatal_without_marko_ui_or_dist(self, tmp_path):
        hermes_root = tmp_path / "hermes"
        hermes_root.mkdir()
        assert _build_web_ui(hermes_root, fatal=True) is False

    def test_npm_install_uses_utf8_replace_output_decoding(self, tmp_path):
        cwd = tmp_path
        (cwd / "package-lock.json").write_text("{}", encoding="utf-8")

        mock_cp = __import__("subprocess").CompletedProcess([], 0, stdout="", stderr="")
        with patch("hermes_cli.main.subprocess.run", return_value=mock_cp) as mock_run:
            result = _run_npm_install_deterministic("/usr/bin/npm", cwd)

        assert result.returncode == 0
        _, kwargs = mock_run.call_args
        assert kwargs["text"] is True
        assert kwargs["encoding"] == "utf-8"
        assert kwargs["errors"] == "replace"


class TestBuildWebUIRetryAndStaleFallback:
    def test_retries_build_once_on_failure(self, tmp_path):
        hermes_root, _, _, _ = _make_marko_layout(tmp_path)
        Subprocess = __import__("subprocess")
        install_ok = Subprocess.CompletedProcess([], 0, stdout="", stderr="")
        build_fail = Subprocess.CompletedProcess([], 1, stdout="EPERM", stderr="")
        build_ok = Subprocess.CompletedProcess([], 0, stdout="", stderr="")
        with patch("hermes_constants.find_node_executable", return_value="/usr/bin/npm"), \
             patch("hermes_cli.main._time.sleep") as mock_sleep, \
             patch("hermes_cli.main.subprocess.run", return_value=install_ok), \
             patch("hermes_cli.main._run_with_idle_timeout",
                   side_effect=[build_fail, build_ok]) as mock_idle:
            result = _build_web_ui(hermes_root)

        assert result is True
        assert mock_idle.call_count == 2
        mock_sleep.assert_called_once_with(3)

    def test_falls_back_to_stale_dist_when_retry_also_fails(self, tmp_path, capsys):
        hermes_root, _, ui_dir, dist_dir = _make_marko_layout(tmp_path)
        _touch(dist_dir / "index.html", offset=-100)
        _touch(ui_dir / "src" / "App.tsx")

        Subprocess = __import__("subprocess")
        install_ok = Subprocess.CompletedProcess([], 0, stdout="", stderr="")
        build_fail = Subprocess.CompletedProcess([], 1, stdout="next ENOMEM", stderr="")
        with patch("hermes_constants.find_node_executable", return_value="/usr/bin/npm"), \
             patch("hermes_cli.main._time.sleep"), \
             patch("hermes_cli.main.subprocess.run", return_value=install_ok), \
             patch("hermes_cli.main._run_with_idle_timeout",
                   side_effect=[build_fail, build_fail]):
            result = _build_web_ui(hermes_root, fatal=True)

        assert result is True
        out = capsys.readouterr().out
        assert "serving stale dist as fallback" in out
        assert "next ENOMEM" in out
