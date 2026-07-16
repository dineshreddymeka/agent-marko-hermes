#!/usr/bin/env bash
# Pin AionUi's builtin Hermes agent to this repo's hermes shim + refresh health.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE_URL="${AIONUI_BASE_URL:-http://127.0.0.1:25808}"
HERMES_BIN="${HERMES_BIN:-${ROOT}/scripts/bin/hermes}"
FORCE_CHECK="${AIONUI_FORCE_HEALTHCHECK:-0}"

if [[ ! -x "$HERMES_BIN" ]]; then
  chmod +x "$HERMES_BIN" || true
fi

echo "Looking up Hermes agent at ${BASE_URL}…"
MGMT="$(curl -fsS "${BASE_URL}/api/agents/management")"
read -r HERMES_ID CUR_CMD CUR_STATUS <<EOF
$(printf '%s' "$MGMT" | python3 -c '
import json,sys
for a in (json.load(sys.stdin).get("data") or []):
    info = a.get("agent_source_info") or {}
    if a.get("backend") == "hermes" or info.get("binary_name") == "hermes":
        print(a["id"], a.get("command") or "", a.get("status") or "")
        break
')
EOF

if [[ -z "${HERMES_ID}" ]]; then
  echo "error: Hermes agent not found in /api/agents/management" >&2
  exit 1
fi

echo "Hermes agent id: ${HERMES_ID} (status=${CUR_STATUS})"

if [[ "$CUR_CMD" == "$HERMES_BIN" && "$CUR_STATUS" == "online" && "$FORCE_CHECK" != "1" ]]; then
  echo "✓ Already pinned + online — skip health-check"
  exit 0
fi

if [[ "$CUR_CMD" != "$HERMES_BIN" ]]; then
  echo "Setting command_override → ${HERMES_BIN}"
  curl -fsS -X PUT "${BASE_URL}/api/agents/${HERMES_ID}/overrides" \
    -H 'Content-Type: application/json' \
    -d "{\"command_override\": \"${HERMES_BIN}\"}" \
    | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d.get("success") else 1)'
fi

echo "Running health-check…"
RESULT="$(
  curl -fsS -X POST "${BASE_URL}/api/agents/${HERMES_ID}/health-check" | python3 -c '
import json, sys
d = json.load(sys.stdin)
data = d.get("data") or {}
print(data.get("status") or data.get("last_check_status") or "?")
print(data.get("command") or "")
print(data.get("last_check_error_message") or "")
print(data.get("last_check_latency_ms") or "")
'
)"

STATUS="$(printf '%s\n' "$RESULT" | sed -n '1p')"
CMD="$(printf '%s\n' "$RESULT" | sed -n '2p')"
ERR="$(printf '%s\n' "$RESULT" | sed -n '3p')"
LAT="$(printf '%s\n' "$RESULT" | sed -n '4p')"

echo "  status:  ${STATUS}  (${LAT}ms)"
echo "  command: ${CMD}"
[[ -n "$ERR" ]] && echo "  note:    ${ERR}"

if [[ "$STATUS" != "online" ]]; then
  echo "warn: Hermes health-check status=${STATUS}" >&2
  exit 1
fi

echo "✓ AionUi Hermes agent online"
