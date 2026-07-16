#!/usr/bin/env bash
# Fast path: Hermes OpenAI-compatible proxy + Chainlit UI (+ optional Cloudflare tunnel).
# Marko / :9119 is not used on this branch's default preview.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMUX_CFG="/exec-daemon/tmux.portal.conf"
[[ -f "$TMUX_CFG" ]] || TMUX_CFG=""
tmux_cmd() {
  if [[ -n "$TMUX_CFG" ]]; then tmux -f "$TMUX_CFG" "$@"; else tmux "$@"; fi
}

PROXY_HOST="${HERMES_PROXY_HOST:-127.0.0.1}"
PROXY_PORT="${HERMES_PROXY_PORT:-8645}"
PROXY_PROVIDER="${HERMES_PROXY_PROVIDER:-nous}"
CHAINLIT_HOST="${CHAINLIT_HOST:-0.0.0.0}"
CHAINLIT_PORT="${CHAINLIT_PORT:-8000}"
OPEN_TUNNEL="${OPEN_TUNNEL:-1}"
PROXY_URL="http://127.0.0.1:${PROXY_PORT}/v1"
API_KEY="${OPENAI_API_KEY:-hermes-proxy}"

SESSION_PROXY=hermes-proxy
SESSION_CHAINLIT=chainlit-ui
SESSION_TUNNEL=chainlit-tunnel

ensure_session() {
  local name="$1" cwd="$2"
  tmux_cmd has-session -t "=$name" 2>/dev/null || \
    tmux_cmd new-session -d -s "$name" -c "$cwd" -- "${SHELL:-bash}" -l
}

echo "Installing Chainlit deps (user)…"
python3 -m pip install -q -r "$ROOT/chainlit_app/requirements.txt" --user 2>/dev/null \
  || python3 -m pip install -q -r "$ROOT/chainlit_app/requirements.txt"

# Free ports if stale
fuser -k "${PROXY_PORT}/tcp" 2>/dev/null || true
fuser -k "${CHAINLIT_PORT}/tcp" 2>/dev/null || true
sleep 0.3

# --- Hermes proxy ---
ensure_session "$SESSION_PROXY" "$ROOT/hermes"
tmux_cmd send-keys -t "$SESSION_PROXY:0.0" C-c C-m
sleep 0.2
tmux_cmd send-keys -t "$SESSION_PROXY:0.0" \
  "cd '$ROOT/hermes' && PYTHONPATH=. python3 -m hermes_cli.main proxy start --provider '$PROXY_PROVIDER' --host '$PROXY_HOST' --port '$PROXY_PORT'" C-m

echo "Waiting for Hermes proxy on :${PROXY_PORT}…"
proxy_ok=0
for _ in $(seq 1 40); do
  # Proxy has no /health; treat open TCP / any HTTP response as up.
  if curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 1 \
      "http://127.0.0.1:${PROXY_PORT}/v1/models" 2>/dev/null | grep -qE '^[0-9]+$'; then
    proxy_ok=1
    break
  fi
  # Still starting, or auth failure prints then exits — check process briefly
  sleep 0.25
done

if [[ "$proxy_ok" -ne 1 ]]; then
  echo
  echo "⚠ Hermes proxy did not become ready on :${PROXY_PORT}."
  echo "  Common cause: not logged in. Run:"
  echo "    cd hermes && PYTHONPATH=. python3 -m hermes_cli.main proxy status"
  echo "    cd hermes && PYTHONPATH=. python3 -m hermes_cli.main auth add nous"
  echo "  Continuing to start Chainlit anyway (chat will error until proxy works)."
  echo
fi

# --- Chainlit ---
ensure_session "$SESSION_CHAINLIT" "$ROOT/chainlit_app"
tmux_cmd send-keys -t "$SESSION_CHAINLIT:0.0" C-c C-m
sleep 0.2
tmux_cmd send-keys -t "$SESSION_CHAINLIT:0.0" \
  "cd '$ROOT/chainlit_app' && \
export HERMES_PROXY_URL='$PROXY_URL' OPENAI_API_BASE='$PROXY_URL' OPENAI_API_KEY='$API_KEY' && \
python3 -m chainlit run app.py -w --host '$CHAINLIT_HOST' --port '$CHAINLIT_PORT'" C-m

echo "Waiting for Chainlit on :${CHAINLIT_PORT}…"
ui_ok=0
for _ in $(seq 1 60); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 1 \
    "http://127.0.0.1:${CHAINLIT_PORT}/" 2>/dev/null || echo 000)
  if [[ "$code" == "200" || "$code" == "307" || "$code" == "302" ]]; then
    ui_ok=1
    break
  fi
  sleep 0.25
done
[[ "$ui_ok" -eq 1 ]] || { echo "Chainlit failed to start" >&2; exit 1; }

echo
echo "✓ Chainlit + Hermes proxy"
echo "  Proxy:    $PROXY_URL"
echo "  Chainlit: http://127.0.0.1:${CHAINLIT_PORT}/"
echo "  (Marko one-hop :9119 is not the default on this branch)"
echo

PUBLIC_URL=""
if [[ "$OPEN_TUNNEL" == "1" ]]; then
  BIN="${CLOUDFLARED_BIN:-}"
  if [[ -z "$BIN" ]]; then
    if command -v cloudflared >/dev/null; then
      BIN="$(command -v cloudflared)"
    elif [[ -x /tmp/cloudflared ]]; then
      BIN=/tmp/cloudflared
    else
      curl -sSL -o /tmp/cloudflared \
        https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
      chmod +x /tmp/cloudflared
      BIN=/tmp/cloudflared
    fi
  fi
  LOG=/tmp/cloudflared-chainlit.log
  : > "$LOG"
  ensure_session "$SESSION_TUNNEL" "$ROOT"
  tmux_cmd send-keys -t "$SESSION_TUNNEL:0.0" C-c C-m
  sleep 0.3
  tmux_cmd send-keys -t "$SESSION_TUNNEL:0.0" \
    "'$BIN' tunnel --url http://127.0.0.1:${CHAINLIT_PORT} --no-autoupdate 2>&1 | tee '$LOG'" C-m
  for _ in $(seq 1 45); do
    PUBLIC_URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1 || true)
    [[ -n "$PUBLIC_URL" ]] && break
    sleep 1
  done
  if [[ -n "$PUBLIC_URL" ]]; then
    echo "$PUBLIC_URL" > /tmp/chainlit-public-url.txt
    echo "  Public:   $PUBLIC_URL"
    echo "  (open this from your laptop — 127.0.0.1 is the cloud VM)"
  else
    echo "  Public:   (tunnel URL not ready — see $LOG)"
  fi
  echo
fi

echo "Stop: tmux kill-session -t $SESSION_PROXY; tmux kill-session -t $SESSION_CHAINLIT"
[[ "$OPEN_TUNNEL" == "1" ]] && echo "      tmux kill-session -t $SESSION_TUNNEL"
