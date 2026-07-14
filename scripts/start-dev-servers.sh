#!/usr/bin/env bash
# Start / restart Marko Next (:5173) + Hermes (:9119) for cloud/dev preview.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMUX_CFG="/exec-daemon/tmux.portal.conf"
[[ -f "$TMUX_CFG" ]] || TMUX_CFG=""
tmux_cmd() {
  if [[ -n "$TMUX_CFG" ]]; then tmux -f "$TMUX_CFG" "$@"; else tmux "$@"; fi
}

ensure_session() {
  local name="$1" cwd="$2"
  tmux_cmd has-session -t "=$name" 2>/dev/null || \
    tmux_cmd new-session -d -s "$name" -c "$cwd" -- "${SHELL:-bash}" -l
}

wait_http() {
  local url="$1" label="$2" n=40
  for ((i=1; i<=n; i++)); do
    code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 1 "$url" 2>/dev/null || echo 000)
    if [[ "$code" == "200" || "$code" == "401" ]]; then
      echo "✓ $label → $url ($code)"
      return 0
    fi
    sleep 1
  done
  echo "✗ $label not ready: $url (last=$code)" >&2
  return 1
}

# Free stale listeners
fuser -k 5173/tcp 2>/dev/null || true
# Only kill Hermes if unhealthy
if ! curl -sS -o /dev/null --connect-timeout 1 http://127.0.0.1:9119/api/health 2>/dev/null; then
  fuser -k 9119/tcp 2>/dev/null || true
fi
sleep 0.5

ensure_session hermes-dashboard "$ROOT/hermes"
ensure_session marko-next-dev "$ROOT"

# Hermes on loopback (session-token auth). Next proxies to it.
if ! curl -sS -o /dev/null --connect-timeout 1 http://127.0.0.1:9119/api/health 2>/dev/null; then
  tmux_cmd send-keys -t hermes-dashboard:0.0 C-c C-m
  sleep 0.3
  tmux_cmd send-keys -t hermes-dashboard:0.0 \
    "cd '$ROOT/hermes' && PYTHONPATH=. python3 -m hermes_cli.main dashboard --host 127.0.0.1 --port 9119 --no-open --skip-build" C-m
fi

# Next on :: (dual-stack) so localhost / ::1 / 127.0.0.1 all work — avoids browser -102
tmux_cmd send-keys -t marko-next-dev:0.0 C-c C-m
sleep 0.3
tmux_cmd send-keys -t marko-next-dev:0.0 \
  "cd '$ROOT' && npm run dev:ui" C-m

wait_http "http://127.0.0.1:9119/api/health" "Hermes"
wait_http "http://127.0.0.1:5173/" "Next IPv4"
# IPv6 localhost (common Cursor/Chrome localhost resolution)
curl -g -sS -o /dev/null --connect-timeout 1 'http://[::1]:5173/' 2>/dev/null \
  && echo "✓ Next IPv6 → http://[::1]:5173/" \
  || echo "warn: IPv6 ::1 not accepting (IPv4 still ok)"
wait_http "http://127.0.0.1:5173/api/health" "Next→Hermes proxy"

echo
echo "Open (inside VM / Cursor Ports): http://127.0.0.1:5173/"
echo "API docs:                        http://127.0.0.1:9119/docs"
echo
echo "If your laptop browser shows Error -102 on 127.0.0.1, that address is the"
echo "cloud VM — use Cursor Ports, or start a public tunnel:"
echo "  bash scripts/start-ui-tunnel.sh"
