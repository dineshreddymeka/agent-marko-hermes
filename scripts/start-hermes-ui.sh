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

SKIP_BUILD=0
FORCE_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --force-build) FORCE_BUILD=1 ;;
  esac
done

# Content-hash build stamp: skip `next build` when UI sources are unchanged.
# Default path is both safe (no stale dist) and fast (no needless rebuild).
STAMP_FILE="$ROOT/hermes/hermes_cli/web_dist/.build-stamp"
build_hash() {
  find "$ROOT/ui/src" "$ROOT/ui/app" "$ROOT/packages/shared/src" \
       "$ROOT/ui/package.json" "$ROOT/ui/next.config.ts" \
       -type f -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null \
       | sha256sum | cut -d' ' -f1
}
if [[ "$SKIP_BUILD" -eq 0 ]]; then
  want="$(build_hash)"
  have="$(cat "$STAMP_FILE" 2>/dev/null || true)"
  if [[ "$FORCE_BUILD" -eq 0 && -n "$want" && "$want" == "$have" \
        && -f "$ROOT/hermes/hermes_cli/web_dist/index.html" ]]; then
    echo "Marko UI unchanged (stamp ${want:0:12}…) — skipping build"
  else
    echo "Building Marko UI → hermes/hermes_cli/web_dist …"
    (cd "$ROOT" && npm run build:ui)
    printf '%s' "$want" > "$STAMP_FILE"
  fi
fi

fuser -k 9119/tcp 2>/dev/null || true
# Wait for the port to actually free (typically <50 ms) instead of sleep 0.5.
for _ in $(seq 1 40); do
  ss -ltn 2>/dev/null | grep -q ':9119 ' || break
  sleep 0.05
done

tmux_cmd has-session -t "=hermes-dashboard" 2>/dev/null || \
  tmux_cmd new-session -d -s hermes-dashboard -c "$ROOT/hermes" -- "${SHELL:-bash}" -l
tmux_cmd send-keys -t hermes-dashboard:0.0 C-c C-m
sleep 0.2
tmux_cmd send-keys -t hermes-dashboard:0.0 \
  "cd '$ROOT/hermes' && PYTHONPATH=. python3 -m hermes_cli.main dashboard --host 127.0.0.1 --port 9119 --no-open --skip-build" C-m

# 250 ms health poll: readiness detected up to 750 ms sooner than 1 s polls
# (same 45 s overall cap).
ok=0
for _ in $(seq 1 180); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 1 http://127.0.0.1:9119/api/health 2>/dev/null || echo 000)
  if [[ "$code" == "200" ]]; then ok=1; break; fi
  sleep 0.25
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
echo "Open http://127.0.0.1:9119/ (forward local port 9119 if previewing remotely)."
echo "Do not use :5173 — that was the Next proxy and is stopped."
