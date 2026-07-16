#!/usr/bin/env bash
# AionUi WebUI + Hermes Agent (ACP) backend.
#
# Architecture:
#   Browser → AionUi WebUI (aionui-web + aioncore)
#                 └─ ACP → hermes acp → this repo's Hermes Agent
#
# Marko one-hop (:9119) is unchanged; this is an alternate UI path.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMUX_CFG="/exec-daemon/tmux.portal.conf"
[[ -f "$TMUX_CFG" ]] || TMUX_CFG=""
tmux_cmd() {
  if [[ -n "$TMUX_CFG" ]]; then tmux -f "$TMUX_CFG" "$@"; else tmux "$@"; fi
}

INSTALL_DIR="${AIONUI_WEB_DIR:-${HOME}/.local/share/aionui-web}"
AIONUI_PORT="${AIONUI_PORT:-25808}"
OPEN_TUNNEL="${OPEN_TUNNEL:-0}"
OPEN_REMOTE="${AIONUI_REMOTE:-1}"
SESSION_UI=aionui-web
SESSION_TUNNEL=aionui-tunnel
DATA_DIR="${AIONUI_DATA_DIR:-${HOME}/.aionui-hermes}"

ensure_session() {
  local name="$1" cwd="$2"
  tmux_cmd has-session -t "=$name" 2>/dev/null || \
    tmux_cmd new-session -d -s "$name" -c "$cwd" -- "${SHELL:-bash}" -l
}

# --- deps ---
bash "${ROOT}/scripts/ensure-hermes-acp.sh"
bash "${ROOT}/scripts/ensure-aionui-web.sh"

# Repo hermes wrapper first, then user local bins
export PATH="${ROOT}/scripts/bin:${HOME}/.local/bin:${PATH}"
mkdir -p "$DATA_DIR"

# Verify hermes is the one AionUi will spawn
HERMES_BIN="$(command -v hermes)"
echo "Hermes on PATH: ${HERMES_BIN}"
if ! hermes acp --check >/dev/null 2>&1; then
  # Some builds expose check only via python -m; wrapper may pass through.
  PYTHONPATH="${ROOT}/hermes" python3 -m acp_adapter.entry --check
fi

# Free port if stale
fuser -k "${AIONUI_PORT}/tcp" 2>/dev/null || true
sleep 0.3

# --- AionUi WebUI ---
ensure_session "$SESSION_UI" "$ROOT"
tmux_cmd send-keys -t "$SESSION_UI:0.0" C-c C-m
sleep 0.2

# aionui-web start serves WebUI; aioncore is bundled. Hermes is detected via PATH.
REMOTE_ARG=""
[[ "$OPEN_REMOTE" == "1" ]] && REMOTE_ARG="--remote"
# Expand PATH in this shell, then pass a concrete value into tmux. Do NOT leave
# a literal '$PATH' in single quotes — aioncore inherits that broken PATH and
# ACP children cannot find python3/bash via /usr/bin/env.
AIONUI_PATH="${ROOT}/scripts/bin:${HOME}/.local/bin:${PATH}"
tmux_cmd send-keys -t "$SESSION_UI:0.0" \
  "export PATH=$(printf '%q' "${AIONUI_PATH}") AIONUI_OPEN_BROWSER=0 && \
$(printf '%q' "${INSTALL_DIR}/aionui-web") start --port $(printf '%q' "${AIONUI_PORT}") --data-dir $(printf '%q' "${DATA_DIR}") ${REMOTE_ARG} --no-open" C-m

echo "Waiting for AionUi WebUI on :${AIONUI_PORT}…"
ui_ok=0
for _ in $(seq 1 90); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 1 \
    "http://127.0.0.1:${AIONUI_PORT}/" 2>/dev/null || echo 000)
  if [[ "$code" == "200" || "$code" == "307" || "$code" == "302" || "$code" == "401" ]]; then
    ui_ok=1
    break
  fi
  sleep 0.5
done

if [[ "$ui_ok" -ne 1 ]]; then
  echo "AionUi WebUI failed to become ready on :${AIONUI_PORT}" >&2
  echo "Check tmux session: ${SESSION_UI}" >&2
  tmux_cmd capture-pane -t "$SESSION_UI:0.0" -p 2>/dev/null | tail -40 >&2 || true
  exit 1
fi

# Pin builtin Hermes agent to this checkout's shim + print health
bash "${ROOT}/scripts/seed-aionui-hermes.sh" || true
python3 "${ROOT}/scripts/smoke_aionui_hermes.py" || true

echo
echo "✓ AionUi + Hermes (ACP)"
echo "  UI:     http://127.0.0.1:${AIONUI_PORT}/"
echo "  Hermes: ${HERMES_BIN}  (AionUi launches: hermes acp)"
echo "  Data:   ${DATA_DIR}"
echo
echo "  In AionUi: pick Hermes (auto-detected builtin ACP agent)."
echo "  If offline: configure a model first →  hermes setup model"
echo "  Smoke:      python3 scripts/smoke_aionui_hermes.py"
echo


PUBLIC_URL=""
if [[ "$OPEN_TUNNEL" == "1" ]]; then
  ensure_session "$SESSION_TUNNEL" "$ROOT"
  tmux_cmd send-keys -t "$SESSION_TUNNEL:0.0" C-c C-m
  sleep 0.2
  # Prefer cloudflared if present
  if command -v cloudflared >/dev/null 2>&1; then
    tmux_cmd send-keys -t "$SESSION_TUNNEL:0.0" \
      "cloudflared tunnel --url http://127.0.0.1:${AIONUI_PORT}" C-m
  else
    # npx quick tunnel fallback
    tmux_cmd send-keys -t "$SESSION_TUNNEL:0.0" \
      "npx --yes cloudflared tunnel --url http://127.0.0.1:${AIONUI_PORT}" C-m
  fi
  echo "Tunnel starting (session ${SESSION_TUNNEL})…"
  for _ in $(seq 1 40); do
    PUBLIC_URL=$(tmux_cmd capture-pane -t "$SESSION_TUNNEL:0.0" -p 2>/dev/null \
      | grep -Eo 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' | tail -1 || true)
    [[ -n "$PUBLIC_URL" ]] && break
    sleep 0.5
  done
  if [[ -n "$PUBLIC_URL" ]]; then
    echo "  Public: ${PUBLIC_URL}"
  else
    echo "  Public: (tunnel URL not ready yet — check tmux ${SESSION_TUNNEL})"
  fi
  echo
fi

echo "Stop: tmux kill-session -t ${SESSION_UI}"
if [[ "$OPEN_TUNNEL" == "1" ]]; then
  echo "      tmux kill-session -t ${SESSION_TUNNEL}"
fi
