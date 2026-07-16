#!/usr/bin/env bash
# Install AionUi WebUI (standalone, no Electron) if missing.
# Upstream: https://github.com/iOfficeAI/AionUi
set -euo pipefail

INSTALL_DIR="${AIONUI_WEB_DIR:-${HOME}/.local/share/aionui-web}"
BIN_DIR="${AIONUI_WEB_BIN_DIR:-${HOME}/.local/bin}"
VERSION="${AIONUI_WEB_VERSION:-latest}"
FORCE="${AIONUI_WEB_FORCE:-0}"

if [[ -x "${INSTALL_DIR}/aionui-web" && "$FORCE" != "1" ]]; then
  echo "✓ AionUi WebUI already installed at ${INSTALL_DIR}"
  "${INSTALL_DIR}/aionui-web" version 2>/dev/null || true
  exit 0
fi

echo "Installing AionUi WebUI → ${INSTALL_DIR}…"
TMP="$(mktemp)"
curl -fsSL "https://raw.githubusercontent.com/iOfficeAI/AionUi/main/scripts/install-web.sh" -o "$TMP"
chmod +x "$TMP"
VERSION="$VERSION" INSTALL_DIR="$INSTALL_DIR" BIN_DIR="$BIN_DIR" \
  CREATE_SYMLINK=1 UPDATE_PATH=0 \
  bash "$TMP"
rm -f "$TMP"

if [[ ! -x "${INSTALL_DIR}/aionui-web" ]]; then
  echo "error: aionui-web missing after install" >&2
  exit 1
fi

echo "✓ AionUi WebUI installed"
"${INSTALL_DIR}/aionui-web" version 2>/dev/null || true
