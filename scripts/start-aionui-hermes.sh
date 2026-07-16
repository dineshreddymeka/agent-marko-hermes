#!/usr/bin/env bash
# AionUi WebUI + Hermes Agent (ACP) backend — local by default.
#
# Architecture:
#   Browser → AionUi WebUI (aionui-web + aioncore)
#                 └─ ACP → hermes acp → this repo's Hermes Agent
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
FORCE_RESTART="${AIONUI_FORCE_RESTART:-0}"
RUN_SMOKE="${AIONUI_SMOKE:-0}"
SESSION_UI=aionui-web
SESSION_TUNNEL=aionui-tunnel
DATA_DIR="${AIONUI_DATA_DIR:-${HOME}/.aionui-hermes}"
BASE_URL="http://127.0.0.1:${AIONUI_PORT}"

ensure_session() {
  local name="$1" cwd="$2"
  tmux_cmd has-session -t "=$name" 2>/dev/null || \
    tmux_cmd new-session -d -s "$name" -c "$cwd" -- "${SHELL:-bash}" -l
}

ui_up() {
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 1 \
    "${BASE_URL}/" 2>/dev/null || echo 000)
  [[ "$code" == "200" || "$code" == "307" || "$code" == "302" || "$code" == "401" ]]
}

# --- deps (fast no-op when already installed) ---
bash "${ROOT}/scripts/ensure-hermes-acp.sh"
bash "${ROOT}/scripts/ensure-aionui-web.sh"

export PATH="${ROOT}/scripts/bin:${HOME}/.local/bin:${PATH}"
mkdir -p "$DATA_DIR"
HERMES_BIN="$(command -v hermes)"
echo "Hermes on PATH: ${HERMES_BIN}"

if ui_up && [[ "$FORCE_RESTART" != "1" ]]; then
  echo "✓ AionUi already running on :${AIONUI_PORT} (skip restart; AIONUI_FORCE_RESTART=1 to bounce)"
else
  fuser -k "${AIONUI_PORT}/tcp" 2>/dev/null || true
  sleep 0.2

  ensure_session "$SESSION_UI" "$ROOT"
  tmux_cmd send-keys -t "$SESSION_UI:0.0" C-c C-m
  sleep 0.2

  REMOTE_ARG=""
  [[ "$OPEN_REMOTE" == "1" ]] && REMOTE_ARG="--remote"
  AIONUI_PATH="${ROOT}/scripts/bin:${HOME}/.local/bin:${PATH}"
  tmux_cmd send-keys -t "$SESSION_UI:0.0" \
    "export PATH=$(printf '%q' "${AIONUI_PATH}") AIONUI_OPEN_BROWSER=0 && \
$(printf '%q' "${INSTALL_DIR}/aionui-web") start --port $(printf '%q' "${AIONUI_PORT}") --data-dir $(printf '%q' "${DATA_DIR}") ${REMOTE_ARG} --no-open" C-m

  echo "Waiting for AionUi WebUI on :${AIONUI_PORT}…"
  ui_ok=0
  for _ in $(seq 1 90); do
    if ui_up; then ui_ok=1; break; fi
    sleep 0.25
  done
  if [[ "$ui_ok" -ne 1 ]]; then
    echo "AionUi WebUI failed to become ready on :${AIONUI_PORT}" >&2
    tmux_cmd capture-pane -t "$SESSION_UI:0.0" -p 2>/dev/null | tail -40 >&2 || true
    exit 1
  fi
fi

# Prefer Composer proxy (Cursor Agent CLI → OpenAI-compatible :4646).
# Override with HERMES_USE_COMPOSER_PROXY=0 to use OpenRouter/OpenAI/Anthropic env keys.
USE_COMPOSER="${HERMES_USE_COMPOSER_PROXY:-1}"
if [[ "$USE_COMPOSER" == "1" ]]; then
  bash "${ROOT}/scripts/start-composer-proxy.sh" || true
  bash "${ROOT}/scripts/configure-hermes-composer.sh" || true
elif [[ -n "${OPENROUTER_API_KEY:-}${OPENAI_API_KEY:-}${ANTHROPIC_API_KEY:-}" ]]; then
  bash "${ROOT}/scripts/configure-hermes-provider.sh" || true
fi

# Pin Hermes only if needed (seed skips when already online + correct override)
AIONUI_BASE_URL="${BASE_URL}" bash "${ROOT}/scripts/seed-aionui-hermes.sh" || true

if [[ "$RUN_SMOKE" == "1" ]]; then
  AIONUI_BASE_URL="${BASE_URL}" python3 "${ROOT}/scripts/smoke_aionui_hermes.py" || true
fi

PROVIDER_OK=0
PYTHONPATH="${ROOT}/hermes${PYTHONPATH:+:$PYTHONPATH}" \
  python3 -c 'import sys; sys.path.insert(0,"'"${ROOT}"'/hermes"); from acp_adapter.auth import has_provider; sys.exit(0 if has_provider() else 1)' \
  && PROVIDER_OK=1 || PROVIDER_OK=0

# Ensure a known admin password for remote login (WebUI requires /login)
PASS_FILE="${DATA_DIR}/.aionui-admin-pass"
if [[ ! -f "$PASS_FILE" ]]; then
  NEW_PASS="$("${INSTALL_DIR}/aionui-web" resetpass --data-dir "$DATA_DIR" 2>/dev/null \
    | awk -F': ' '/new password:/{print $2; exit}')"
  if [[ -n "${NEW_PASS:-}" ]]; then
    printf '%s\n' "$NEW_PASS" > "$PASS_FILE"
    chmod 600 "$PASS_FILE"
  fi
fi

echo
echo "✓ AionUi + Hermes (ACP) — local"
echo "  UI:     ${BASE_URL}/"
echo "  Hermes: ${HERMES_BIN}"
echo "  Data:   ${DATA_DIR}"
if [[ -f "$PASS_FILE" ]]; then
  echo "  Login:  admin / $(cat "$PASS_FILE")"
fi
if [[ "$PROVIDER_OK" -eq 1 ]]; then
  echo "  Chat:   provider ready"
else
  echo "  Chat:   BLOCKED — no LLM provider"
  echo "          export OPENROUTER_API_KEY=... && bash scripts/configure-hermes-provider.sh"
fi
echo

if [[ "$OPEN_TUNNEL" == "1" ]]; then
  ensure_session "$SESSION_TUNNEL" "$ROOT"
  tmux_cmd send-keys -t "$SESSION_TUNNEL:0.0" C-c C-m
  sleep 0.2
  rm -f /tmp/aionui-tunnel.log
  if command -v cloudflared >/dev/null 2>&1; then
    tmux_cmd send-keys -t "$SESSION_TUNNEL:0.0" \
      "cloudflared tunnel --url http://127.0.0.1:${AIONUI_PORT} 2>&1 | tee /tmp/aionui-tunnel.log" C-m
  else
    tmux_cmd send-keys -t "$SESSION_TUNNEL:0.0" \
      "npx --yes cloudflared tunnel --url http://127.0.0.1:${AIONUI_PORT} 2>&1 | tee /tmp/aionui-tunnel.log" C-m
  fi
  echo "Tunnel starting (session ${SESSION_TUNNEL})…"
  for _ in $(seq 1 40); do
    TUNNEL_URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/aionui-tunnel.log 2>/dev/null | head -1 || true)"
    if [[ -n "${TUNNEL_URL:-}" ]]; then
      echo "  Public: ${TUNNEL_URL}"
      break
    fi
    sleep 0.25
  done
fi

echo "Stop: tmux kill-session -t ${SESSION_UI}"
