#!/usr/bin/env bash
# One-hop Marko: Hermes serves the static UI + APIs. No Next rewrite proxy,
# no Cloudflare tunnel.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMUX_CFG="/exec-daemon/tmux.portal.conf"
[[ -f "$TMUX_CFG" ]] || TMUX_CFG=""
tmux_cmd() {
  if [[ -n "$TMUX_CFG" ]]; then tmux -f "$TMUX_CFG" "$@"; else tmux "$@"; fi
}

# Stop Next + any tunnel (explicitly no proxy)
tmux_cmd has-session -t "=marko-next-dev" 2>/dev/null && \
  tmux_cmd send-keys -t marko-next-dev:0.0 C-c C-m || true
tmux_cmd has-session -t "=marko-tunnel" 2>/dev/null && \
  tmux_cmd send-keys -t marko-tunnel:0.0 C-c C-m || true
fuser -k 5173/tcp 2>/dev/null || true
pkill -f 'cloudflared tunnel' 2>/dev/null || true

BUILD=1
SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
  esac
done

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  echo "Building Marko UI → hermes/hermes_cli/web_dist …"
  (cd "$ROOT" && npm run build:ui)
fi

fuser -k 9119/tcp 2>/dev/null || true
sleep 0.5

tmux_cmd has-session -t "=hermes-dashboard" 2>/dev/null || \
  tmux_cmd new-session -d -s hermes-dashboard -c "$ROOT/hermes" -- "${SHELL:-bash}" -l
tmux_cmd send-keys -t hermes-dashboard:0.0 C-c C-m
sleep 0.3
tmux_cmd send-keys -t hermes-dashboard:0.0 \
  "cd '$ROOT/hermes' && PYTHONPATH=. python3 -m hermes_cli.main dashboard --host 127.0.0.1 --port 9119 --no-open --skip-build" C-m

ok=0
for _ in $(seq 1 45); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 1 http://127.0.0.1:9119/api/health 2>/dev/null || echo 000)
  if [[ "$code" == "200" ]]; then ok=1; break; fi
  sleep 1
done
[[ "$ok" -eq 1 ]] || { echo "Hermes failed to start" >&2; exit 1; }

html_code=$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:9119/)
token_present=$(curl -sS http://127.0.0.1:9119/ | grep -c '__HERMES_SESSION_TOKEN__' || true)

echo
echo "✓ Hermes one-hop (no Next proxy, no tunnel)"
echo "  UI:   http://127.0.0.1:9119/          (HTTP $html_code)"
echo "  API:  http://127.0.0.1:9119/api/health"
echo "  Docs: http://127.0.0.1:9119/docs"
echo "  Token injected in index.html: $token_present"
echo
echo "Open http://127.0.0.1:9119/ via Cursor → Ports → 9119 (Forward)."
echo "Do not use :5173 — that was the Next proxy and is stopped."
