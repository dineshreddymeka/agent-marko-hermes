#!/usr/bin/env bash
# Open WebUI (left panel + chat) → Hermes API server agent backend (:8642)
# + Hermes Marko panels (:9119) via left-rail shell (:3200)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMUX_CFG="/exec-daemon/tmux.portal.conf"
[[ -f "$TMUX_CFG" ]] || TMUX_CFG=""
tmux_cmd() {
  if [[ -n "$TMUX_CFG" ]]; then tmux -f "$TMUX_CFG" "$@"; else tmux "$@"; fi
}

API_PORT="${API_SERVER_PORT:-8642}"
API_KEY="${API_SERVER_KEY:-hermes-openwebui}"
OWUI_PORT="${OWUI_PORT:-3000}"
SHELL_PORT="${SHELL_PORT:-3200}"
HERMES_UI_PORT="${HERMES_UI_PORT:-9119}"
OPEN_TUNNEL="${OPEN_TUNNEL:-1}"
DATA_DIR="${OPENWEBUI_DATA_DIR:-$ROOT/open_webui_data}"

mkdir -p "$DATA_DIR" "$HOME/.hermes"
# API server env (Hermes reads from ~/.hermes/.env)
ENV_FILE="$HOME/.hermes/.env"
touch "$ENV_FILE"
ensure_env() {
  local k="$1" v="$2"
  if grep -q "^${k}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${k}=.*|${k}=${v}|" "$ENV_FILE"
  else
    printf '%s=%s\n' "$k" "$v" >> "$ENV_FILE"
  fi
}
ensure_env API_SERVER_ENABLED true
ensure_env API_SERVER_KEY "$API_KEY"
ensure_env API_SERVER_PORT "$API_PORT"
ensure_env API_SERVER_HOST 127.0.0.1
ensure_env API_SERVER_MODEL_NAME hermes-agent

# Minimal config if missing model provider
if [[ ! -f "$HOME/.hermes/config.yaml" ]]; then
  cat > "$HOME/.hermes/config.yaml" <<'EOF'
model:
  provider: copilot
  default: gpt-4.1
platforms:
  api_server:
    enabled: true
    max_concurrent_runs: 10
display:
  personality: none
EOF
fi

ensure_session() {
  local name="$1" cwd="$2"
  tmux_cmd has-session -t "=$name" 2>/dev/null || \
    tmux_cmd new-session -d -s "$name" -c "$cwd" -- "${SHELL:-bash}" -l
}

echo "Ensuring Open WebUI + shell deps…"
python3 -m pip install -q --user 'open-webui==0.10.2' -r "$ROOT/openwebui_app/requirements.txt" 2>/dev/null \
  || python3 -m pip install -q --user 'open-webui==0.10.2' -r "$ROOT/openwebui_app/requirements.txt"
export PATH="$HOME/.local/bin:$PATH"

# --- Hermes API server (gateway) ---
ensure_session hermes-gateway "$ROOT/hermes"
tmux_cmd send-keys -t hermes-gateway:0.0 C-c C-m
sleep 0.3
tmux_cmd send-keys -t hermes-gateway:0.0 \
  "cd '$ROOT/hermes' && set -a && source '$HOME/.hermes/.env' && set +a && PYTHONPATH=. HERMES_ACCEPT_HOOKS=1 python3 -m hermes_cli.main gateway run -v --replace --accept-hooks" C-m

echo "Waiting for Hermes API server :${API_PORT}…"
ok=0
for _ in $(seq 1 60); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 1 "http://127.0.0.1:${API_PORT}/health" 2>/dev/null || echo 000)
  if [[ "$code" == "200" ]]; then ok=1; break; fi
  sleep 0.5
done
[[ "$ok" -eq 1 ]] || { echo "Hermes API server failed" >&2; exit 1; }
curl -sS -H "Authorization: Bearer ${API_KEY}" "http://127.0.0.1:${API_PORT}/v1/models" | head -c 200; echo

# --- Hermes Marko dashboard (panels for left-rail actions) ---
if [[ -x "$ROOT/scripts/start-hermes-ui.sh" ]]; then
  echo "Starting Hermes Marko panels on :${HERMES_UI_PORT} (skip-build if stamped)…"
  bash "$ROOT/scripts/start-hermes-ui.sh" --skip-build >/tmp/hermes-ui-owui.log 2>&1 || \
    bash "$ROOT/scripts/start-hermes-ui.sh" >/tmp/hermes-ui-owui.log 2>&1 || true
fi

# --- Open WebUI ---
fuser -k "${OWUI_PORT}/tcp" 2>/dev/null || true
sleep 0.3
ensure_session open-webui "$ROOT"
tmux_cmd send-keys -t open-webui:0.0 C-c C-m
sleep 0.2
tmux_cmd send-keys -t open-webui:0.0 \
  "export PATH=\"\$HOME/.local/bin:\$PATH\"
export DATA_DIR='$DATA_DIR'
export OPENAI_API_BASE_URL='http://127.0.0.1:${API_PORT}/v1'
export OPENAI_API_KEY='${API_KEY}'
export ENABLE_OLLAMA_API=false
export WEBUI_AUTH=false
open-webui serve --host 0.0.0.0 --port ${OWUI_PORT}" C-m

echo "Waiting for Open WebUI :${OWUI_PORT}…"
ok=0
for _ in $(seq 1 120); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 1 "http://127.0.0.1:${OWUI_PORT}/" 2>/dev/null || echo 000)
  if [[ "$code" == "200" || "$code" == "302" || "$code" == "307" ]]; then ok=1; break; fi
  sleep 1
done
[[ "$ok" -eq 1 ]] || { echo "Open WebUI failed" >&2; exit 1; }

# --- Left-rail shell ---
fuser -k "${SHELL_PORT}/tcp" 2>/dev/null || true
ensure_session hermes-owui-shell "$ROOT/openwebui_app"
tmux_cmd send-keys -t hermes-owui-shell:0.0 C-c C-m
sleep 0.2
tmux_cmd send-keys -t hermes-owui-shell:0.0 \
  "cd '$ROOT/openwebui_app' && \
export OWUI_URL='http://127.0.0.1:${OWUI_PORT}' HERMES_URL='http://127.0.0.1:${HERMES_UI_PORT}' SHELL_PORT='${SHELL_PORT}' && \
python3 serve_shell.py --host 0.0.0.0 --port ${SHELL_PORT}" C-m

ok=0
for _ in $(seq 1 40); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 1 "http://127.0.0.1:${SHELL_PORT}/health" 2>/dev/null || echo 000)
  if [[ "$code" == "200" ]]; then ok=1; break; fi
  sleep 0.25
done
[[ "$ok" -eq 1 ]] || { echo "Shell failed" >&2; exit 1; }

echo
echo "✓ Open WebUI + Hermes backend"
echo "  Shell (left panel): http://127.0.0.1:${SHELL_PORT}/"
echo "  Open WebUI chat:    http://127.0.0.1:${OWUI_PORT}/"
echo "  Hermes API:         http://127.0.0.1:${API_PORT}/v1  (key: ${API_KEY})"
echo "  Hermes panels:      http://127.0.0.1:${HERMES_UI_PORT}/"
echo

if [[ "$OPEN_TUNNEL" == "1" ]]; then
  BIN="${CLOUDFLARED_BIN:-}"
  if [[ -z "$BIN" ]]; then
    if command -v cloudflared >/dev/null; then BIN="$(command -v cloudflared)"
    elif [[ -x /tmp/cloudflared ]]; then BIN=/tmp/cloudflared
    else
      curl -sSL -o /tmp/cloudflared \
        https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
      chmod +x /tmp/cloudflared; BIN=/tmp/cloudflared
    fi
  fi
  LOG=/tmp/cloudflared-owui-shell.log
  : > "$LOG"
  ensure_session owui-tunnel "$ROOT"
  tmux_cmd send-keys -t owui-tunnel:0.0 C-c C-m
  sleep 0.3
  # Tunnel the left-rail shell (embeds OWUI — note: iframe may need same public host; use OWUI tunnel if blocked)
  tmux_cmd send-keys -t owui-tunnel:0.0 \
    "'$BIN' tunnel --url http://127.0.0.1:${SHELL_PORT} --no-autoupdate 2>&1 | tee '$LOG'" C-m
  URL=""
  for _ in $(seq 1 45); do
    URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1 || true)
    [[ -n "$URL" ]] && break
    sleep 1
  done
  if [[ -n "$URL" ]]; then
    echo "$URL" > /tmp/owui-shell-public-url.txt
    echo "  Public shell: $URL"
  fi
  # Also tunnel Open WebUI directly for iframe-friendly access
  LOG2=/tmp/cloudflared-owui.log
  : > "$LOG2"
  ensure_session owui-tunnel-chat "$ROOT"
  tmux_cmd send-keys -t owui-tunnel-chat:0.0 C-c C-m
  sleep 0.3
  tmux_cmd send-keys -t owui-tunnel-chat:0.0 \
    "'$BIN' tunnel --url http://127.0.0.1:${OWUI_PORT} --no-autoupdate 2>&1 | tee '$LOG2'" C-m
  URL2=""
  for _ in $(seq 1 45); do
    URL2=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG2" 2>/dev/null | head -1 || true)
    [[ -n "$URL2" ]] && break
    sleep 1
  done
  if [[ -n "$URL2" ]]; then
    echo "$URL2" > /tmp/owui-public-url.txt
    echo "  Public Open WebUI: $URL2"
  fi
  # Tunnel Hermes Marko panels for left-rail actions
  LOG3=/tmp/cloudflared-hermes-ui.log
  : > "$LOG3"
  ensure_session owui-tunnel-hermes "$ROOT"
  tmux_cmd send-keys -t owui-tunnel-hermes:0.0 C-c C-m
  sleep 0.3
  tmux_cmd send-keys -t owui-tunnel-hermes:0.0 \
    "'$BIN' tunnel --url http://127.0.0.1:${HERMES_UI_PORT} --no-autoupdate 2>&1 | tee '$LOG3'" C-m
  URL3=""
  for _ in $(seq 1 45); do
    URL3=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG3" 2>/dev/null | head -1 || true)
    [[ -n "$URL3" ]] && break
    sleep 1
  done
  if [[ -n "$URL3" ]]; then
    echo "$URL3" > /tmp/hermes-ui-public-url.txt
    echo "  Public Hermes panels: $URL3"
  fi
  # Restart shell so iframe targets use public URLs (browser cannot reach 127.0.0.1 on the VM)
  if [[ -n "${URL2:-}" || -n "${URL3:-}" ]]; then
    tmux_cmd send-keys -t hermes-owui-shell:0.0 C-c C-m
    sleep 0.3
    tmux_cmd send-keys -t hermes-owui-shell:0.0 \
      "cd '$ROOT/openwebui_app' && \
OPENWEBUI_PUBLIC_URL='${URL2:-http://127.0.0.1:${OWUI_PORT}}' \
HERMES_PUBLIC_URL='${URL3:-http://127.0.0.1:${HERMES_UI_PORT}}' \
OWUI_URL='${URL2:-http://127.0.0.1:${OWUI_PORT}}' \
HERMES_URL='${URL3:-http://127.0.0.1:${HERMES_UI_PORT}}' \
python3 serve_shell.py --host 0.0.0.0 --port ${SHELL_PORT}" C-m
    sleep 1
  fi
  echo
fi

echo "Left panel actions open Hermes Marko panels; Chat embeds Open WebUI → Hermes agent tools."
