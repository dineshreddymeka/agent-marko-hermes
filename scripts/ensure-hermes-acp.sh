#!/usr/bin/env bash
# Ensure this repo's Hermes is installed with ACP support and on PATH.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${ROOT}/scripts/bin:${HOME}/.local/bin:${PATH}"

echo "Installing Hermes Agent (editable) with ACP extra…"
python3 -m pip install -q -e "${ROOT}/hermes[acp]" --user

# Sanity: hermes + acp entrypoint
if ! command -v hermes >/dev/null 2>&1; then
  echo "error: hermes not on PATH after install" >&2
  exit 1
fi

# Prefer repo wrapper first so AionUi always sees this checkout
export PATH="${ROOT}/scripts/bin:${PATH}"

echo "Checking ACP adapter…"
PYTHONPATH="${ROOT}/hermes${PYTHONPATH:+:$PYTHONPATH}" \
  python3 -m acp_adapter.entry --check

echo "✓ Hermes ACP ready: $(command -v hermes)"
hermes --version 2>/dev/null || true
