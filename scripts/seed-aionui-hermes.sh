#!/usr/bin/env bash
# Pin AionUi's builtin Hermes agent to this repo's hermes shim + refresh health.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${AIONUI_BASE_URL:-http://127.0.0.1:25808}"
HERMES_BIN="${HERMES_BIN:-${ROOT}/scripts/bin/hermes}"

if [[ ! -x "$HERMES_BIN" ]]; then
  chmod +x "$HERMES_BIN" || true
fi

# Absolute shebang required under aioncore's cleared PATH
if ! head -1 "$HERMES_BIN" | grep -q '^#!/usr/bin/python3'; then
  echo "warn: ${HERMES_BIN} should use #!/usr/bin/python3 shebang" >&2
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
RESULT="$(
  curl -fsS -X POST "${BASE_URL}/api/agents/${HERMES_ID}/health-check" | python3 -c '
import json, sys
d = json.load(sys.stdin)
data = d.get("data") or {}
status = data.get("status") or data.get("last_check_status") or "?"
err = data.get("last_check_error_message") or ""
cmd = data.get("command") or ""
print(status)
print(cmd)
print(err)
'
)"

STATUS="$(printf '%s\n' "$RESULT" | sed -n '1p')"
CMD="$(printf '%s\n' "$RESULT" | sed -n '2p')"
ERR="$(printf '%s\n' "$RESULT" | sed -n '3p')"

echo "  status:  ${STATUS}"
echo "  command: ${CMD}"
if [[ -n "$ERR" ]]; then
  echo "  note:    ${ERR}"
fi

if [[ "$STATUS" != "online" ]]; then
  echo "warn: Hermes health-check status=${STATUS} (expected online)" >&2
  echo "  If provider-related: hermes setup model && re-run this script" >&2
  exit 1
fi

echo "✓ AionUi Hermes agent online (pinned to this checkout)"
