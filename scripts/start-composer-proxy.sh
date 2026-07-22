#!/usr/bin/env bash
# OpenAI-compatible proxy → Cursor Agent CLI (Composer).
# Hermes ACP talks to http://127.0.0.1:4646/v1 ; the proxy spawns `agent -p`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMUX_CFG="/exec-daemon/tmux.portal.conf"
[[ -f "$TMUX_CFG" ]] || TMUX_CFG=""
tmux_cmd() {
  if [[ -n "$TMUX_CFG" ]]; then tmux -f "$TMUX_CFG" "$@"; else tmux "$@"; fi
}

export PATH="${HOME}/.local/bin:${PATH}"
PORT="${COMPOSER_PROXY_PORT:-4646}"
SESSION=composer-proxy
LOGIN_SESSION=composer-login
BASE_URL="http://127.0.0.1:${PORT}/v1"

ensure_agent_cli() {
  if command -v agent >/dev/null 2>&1; then
    return 0
  fi
  echo "Installing Cursor Agent CLI…"
  curl -fsSL https://cursor.com/install | bash
  export PATH="${HOME}/.local/bin:${PATH}"
}

ensure_proxy_pkg() {
  if command -v cursor-agent-api >/dev/null 2>&1; then
    return 0
  fi
  echo "Installing cursor-agent-api-proxy…"
  npm install -g --prefix "${HOME}/.local" cursor-agent-api-proxy
  export PATH="${HOME}/.local/bin:${PATH}"
}

proxy_up() {
  curl -sS --connect-timeout 1 "http://127.0.0.1:${PORT}/health" 2>/dev/null \
    | grep -q '"status":"ok"'
}

ensure_session() {
  local name="$1"
  tmux_cmd has-session -t "=$name" 2>/dev/null || \
    tmux_cmd new-session -d -s "$name" -c "$ROOT" -- "${SHELL:-bash}" -l
}

ensure_agent_cli
ensure_proxy_pkg

# Auth: CURSOR_API_KEY preferred; else interactive agent login.
# Note: cloud-agent JWTs make `agent status` look logged-in but cannot run models.
agent_really_logged_in() {
  [[ -n "${CURSOR_API_KEY:-}" ]] && return 0
  # Probe without mutating auth: try a dry models list via CLI.
  agent --list-models 2>/dev/null | grep -qiE 'composer|auto|gpt|claude|opus|sonnet'
}

if ! agent_really_logged_in; then
  echo "Cursor Agent needs login for Composer (device login or CURSOR_API_KEY)…"
  ensure_session "$LOGIN_SESSION"
  tmux_cmd send-keys -t "$LOGIN_SESSION:0.0" C-c C-m
  sleep 0.2
  rm -f /tmp/composer-agent-login.log /tmp/composer-login-url.txt
  tmux_cmd send-keys -t "$LOGIN_SESSION:0.0" \
    "export PATH=\"${HOME}/.local/bin:\$PATH\"; NO_OPEN_BROWSER=1 agent login 2>&1 | tee /tmp/composer-agent-login.log" C-m
  for _ in $(seq 1 50); do
    LOGIN_URL="$(grep -oE 'https://cursor.com/loginDeepControl[^ ]+' /tmp/composer-agent-login.log 2>/dev/null | head -1 || true)"
    if [[ -n "${LOGIN_URL:-}" ]]; then
      echo
      echo ">>> Open this URL to authorize Composer proxy:"
      echo "    ${LOGIN_URL}"
      echo ">>> Waiting for login (tmux: ${LOGIN_SESSION})…"
      echo "$LOGIN_URL" > /tmp/composer-login-url.txt
      break
    fi
    sleep 0.25
  done
else
  echo "✓ Cursor Agent auth ready for Composer"
fi

if proxy_up; then
  echo "✓ Composer proxy already on :${PORT}"
else
  echo "Starting Composer proxy daemon on :${PORT}…"
  if [[ -n "${CURSOR_API_KEY:-}" ]]; then
    CURSOR_API_KEY="$CURSOR_API_KEY" cursor-agent-api start "$PORT" || true
  else
    cursor-agent-api start "$PORT" || true
  fi
  ok=0
  for _ in $(seq 1 40); do
    if proxy_up; then ok=1; break; fi
    sleep 0.25
  done
  if [[ "$ok" -ne 1 ]]; then
    echo "warn: proxy not ready — finish agent login, then: cursor-agent-api start ${PORT}" >&2
    tail -20 "${HOME}/.cursor-agent-api/server.log" 2>/dev/null >&2 || true
  fi
fi

echo
echo "Composer proxy: ${BASE_URL}"
echo "  Configure Hermes: bash scripts/configure-hermes-composer.sh"
echo "  Models:           curl -s ${BASE_URL}/models"
