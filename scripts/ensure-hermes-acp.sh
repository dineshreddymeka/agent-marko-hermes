#!/usr/bin/env bash
# Ensure this repo's Hermes is installed with ACP support and on PATH.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${ROOT}/scripts/bin:${HOME}/.local/bin:${PATH}"
FORCE="${HERMES_ACP_FORCE_INSTALL:-0}"

_acp_ok() {
  PYTHONPATH="${ROOT}/hermes${PYTHONPATH:+:$PYTHONPATH}" \
    python3 -m acp_adapter.entry --check >/dev/null 2>&1
}

if [[ "$FORCE" != "1" ]] && command -v hermes >/dev/null 2>&1 && _acp_ok; then
  echo "✓ Hermes ACP already ready: $(command -v hermes)"
  exit 0
fi

echo "Installing Hermes Agent (editable) with ACP extra…"
python3 -m pip install -q -e "${ROOT}/hermes[acp]" --user

export PATH="${ROOT}/scripts/bin:${HOME}/.local/bin:${PATH}"
if ! command -v hermes >/dev/null 2>&1; then
  echo "error: hermes not on PATH after install" >&2
  exit 1
fi

echo "Checking ACP adapter…"
PYTHONPATH="${ROOT}/hermes${PYTHONPATH:+:$PYTHONPATH}" \
  python3 -m acp_adapter.entry --check

echo "✓ Hermes ACP ready: $(command -v hermes)"
