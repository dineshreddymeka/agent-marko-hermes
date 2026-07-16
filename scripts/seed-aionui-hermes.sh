#!/usr/bin/env bash
# Pin AionUi's builtin Hermes agent to this repo's hermes shim + refresh health.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${AIONUI_BASE_URL:-http://127.0.0.1:25808}"
HERMES_BIN="${HERMES_BIN:-${ROOT}/scripts/bin/hermes}"

if [[ ! -x "$HERMES_BIN" ]]; then
  chmod +x "$HERMES_BIN" || true
fi

echo "Looking up Hermes agent at ${BASE_URL}…"
HERMES_ID="$(
  curl -fsS "${BASE_URL}/api/agents/management" | python3 -c '
import json,sys
for a in (json.load(sys.stdin).get("data") or []):
    info = a.get("agent_source_info") or {}
    if a.get("backend") == "hermes" or info.get("binary_name") == "hermes":
        print(a["id"]); break
'
)"

if [[ -z "${HERMES_ID}" ]]; then
  echo "error: Hermes agent not found in /api/agents/management" >&2
  echo "  Is AionUi up? Is hermes on PATH for aioncore?" >&2
  exit 1
fi

echo "Hermes agent id: ${HERMES_ID}"
echo "Setting command_override → ${HERMES_BIN}"

curl -fsS -X PUT "${BASE_URL}/api/agents/${HERMES_ID}/overrides" \
  -H 'Content-Type: application/json' \
  -d "{\"command_override\": \"${HERMES_BIN}\"}" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("override ok" if d.get("success") else d); sys.exit(0 if d.get("success") else 1)'

echo "Running health-check…"
curl -fsS -X POST "${BASE_URL}/api/agents/${HERMES_ID}/health-check" | python3 -c '
import json, sys
d = json.load(sys.stdin)
data = d.get("data") or {}
status = data.get("status") or data.get("last_check_status") or "?"
err = data.get("last_check_error_message") or ""
cmd = data.get("command") or ""
print(f"  status:  {status}")
print(f"  command: {cmd}")
if err:
    print(f"  note:    {err}")
    if "No LLM provider" in err or "not configured" in err.lower():
        print()
        print("  Hermes CLI was found. Configure a model, then re-check:")
        print("    cd hermes && PYTHONPATH=. python3 -m hermes_cli.main setup model")
        print("    # or: hermes model")
'

echo "✓ AionUi Hermes agent pinned to this checkout"
