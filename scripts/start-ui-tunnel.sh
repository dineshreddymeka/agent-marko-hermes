#!/usr/bin/env bash
# Public Cloudflare quick tunnel → local Next UI (:5173).
# Use this when opening http://127.0.0.1:5173 from your laptop fails with -102
# (that address is the remote cloud VM, not your machine).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMUX_CFG="/exec-daemon/tmux.portal.conf"
[[ -f "$TMUX_CFG" ]] || TMUX_CFG=""
tmux_cmd() {
  if [[ -n "$TMUX_CFG" ]]; then tmux -f "$TMUX_CFG" "$@"; else tmux "$@"; fi
}

# Ensure UI is up first
bash "$ROOT/scripts/start-dev-servers.sh"

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

SESSION=marko-tunnel
LOG=/tmp/cloudflared-marko.log
: > "$LOG"
tmux_cmd has-session -t "=$SESSION" 2>/dev/null || \
  tmux_cmd new-session -d -s "$SESSION" -c "$ROOT" -- "${SHELL:-bash}" -l
tmux_cmd send-keys -t "$SESSION:0.0" C-c C-m
sleep 0.3
tmux_cmd send-keys -t "$SESSION:0.0" \
  "'$BIN' tunnel --url http://127.0.0.1:5173 --no-autoupdate 2>&1 | tee '$LOG'" C-m

URL=""
for _ in $(seq 1 45); do
  URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.trycloudflare\.com' "$LOG" 2>/dev/null | head -1 || true)
  [[ -n "$URL" ]] && break
  sleep 1
done

if [[ -z "$URL" ]]; then
  echo "Tunnel URL not found — see $LOG" >&2
  exit 1
fi

echo
echo "Public UI (open this in your browser):"
echo "  $URL"
echo "$URL" > /tmp/marko-ui-public-url.txt
curl -sS -o /dev/null -w "probe %{http_code}\n" --connect-timeout 20 "$URL/" || true
