#!/usr/bin/env bash
# AionUi WebUI — local-only, no login screen.
set -euo pipefail
export PATH="${HOME}/.local/bin:${PATH}"

DATA="${AIONUI_DATA_DIR:-${HOME}/.aionui-web-nologin}"
PORT="${AIONUI_PORT:-25808}"
OFFICIAL_STATIC="${HOME}/.local/share/aionui-web/static"
STATIC="${AIONUI_STATIC_DIR:-${DATA}/static-nologin}"
MARKER="${STATIC}/.nologin-patched"

prepare_static() {
  if [[ -f "$MARKER" ]]; then
    return
  fi
  if [[ ! -d "$OFFICIAL_STATIC" ]]; then
    echo "error: AionUi static assets not found at $OFFICIAL_STATIC" >&2
    echo "Install aionui-web first (e.g. npm i -g aionui-web or official installer)." >&2
    exit 1
  fi
  rm -rf "$STATIC"
  cp -a "$OFFICIAL_STATIC" "$STATIC"
  python3 - "$STATIC/index.html" <<'PY'
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
html = path.read_text(encoding="utf-8")
needle = "    <title>AionUi</title>\n"
inject = (
    "    <title>AionUi</title>\n"
    "    <script>\n"
    "      // Local headless: skip WebUI login gate (same as Electron shell).\n"
    "      window.electronAPI = { emit: function () {}, on: function () {} };\n"
    "    </script>\n"
)
if "window.electronAPI" not in html:
    if needle not in html:
        raise SystemExit("could not patch index.html: unexpected layout")
    html = html.replace(needle, inject, 1)
    path.write_text(html, encoding="utf-8")
pathlib.Path(path.parent / ".nologin-patched").write_text("ok\n", encoding="utf-8")
PY
}

pkill -9 -f 'aionui-web start' 2>/dev/null || true
pkill -9 -f 'bundled-aioncore' 2>/dev/null || true
sleep 0.5

mkdir -p "$DATA"
prepare_static

AIONUI_OPEN_BROWSER=0 exec aionui-web start \
  --port "$PORT" \
  --data-dir "$DATA" \
  --static-dir "$STATIC" \
  --no-open
