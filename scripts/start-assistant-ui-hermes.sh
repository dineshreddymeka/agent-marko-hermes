#!/usr/bin/env bash
# Start assistant-ui (AG-UI) against Hermes dashboard on :9119.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
AUI_DIR="$ROOT/apps/assistant-ui"
HERMES_HOST="${HERMES_HOST:-127.0.0.1}"
HERMES_PORT="${HERMES_PORT:-9119}"
AUI_PORT="${ASSISTANT_UI_PORT:-3000}"
TMUX_CFG="/exec-daemon/tmux.portal.conf"
[[ -f "$TMUX_CFG" ]] || TMUX_CFG=""
tmux_cmd() {
  if [[ -n "$TMUX_CFG" ]]; then tmux -f "$TMUX_CFG" "$@"; else tmux "$@"; fi
}

if [[ ! -f "$AUI_DIR/package.json" ]]; then
  echo "Missing $AUI_DIR — scaffold apps/assistant-ui first" >&2
  exit 1
fi

# Ensure Hermes is up (reuse existing dashboard if healthy).
hermes_ok=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 1 "http://${HERMES_HOST}:${HERMES_PORT}/api/health" 2>/dev/null || echo 000)
if [[ "$hermes_ok" != "200" ]]; then
  echo "Starting Hermes dashboard on :${HERMES_PORT}…"
  # Minimal SPA stub so --skip-build works without a full Marko build.
  mkdir -p "$ROOT/hermes/hermes_cli/web_dist"
  if [[ ! -f "$ROOT/hermes/hermes_cli/web_dist/index.html" ]]; then
    cat > "$ROOT/hermes/hermes_cli/web_dist/index.html" <<'HTML'
<!doctype html><html><head><meta charset="utf-8"><title>Hermes</title></head>
<body><p>Hermes API — use assistant-ui on :3000 for AG-UI chat.</p></body></html>
HTML
  fi
  HERMES_PY="$ROOT/hermes/.venv/bin/python"
  [[ -x "$HERMES_PY" ]] || HERMES_PY="python3"
  tmux_cmd has-session -t "=hermes-dashboard" 2>/dev/null || \
    tmux_cmd new-session -d -s hermes-dashboard -c "$ROOT/hermes" -- "${SHELL:-bash}" -l
  tmux_cmd send-keys -t hermes-dashboard:0.0 C-c C-m
  sleep 0.2
  tmux_cmd send-keys -t hermes-dashboard:0.0 \
    "cd '$ROOT/hermes' && PYTHONPATH=. '$HERMES_PY' -m hermes_cli.main dashboard --host ${HERMES_HOST} --port ${HERMES_PORT} --no-open --skip-build" C-m
  for _ in $(seq 1 120); do
    code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 1 "http://${HERMES_HOST}:${HERMES_PORT}/api/health" 2>/dev/null || echo 000)
    if [[ "$code" == "200" ]]; then hermes_ok=200; break; fi
    sleep 0.5
  done
fi

if [[ "$hermes_ok" != "200" ]]; then
  echo "Hermes failed to start on http://${HERMES_HOST}:${HERMES_PORT}/api/health" >&2
  exit 1
fi

if [[ ! -d "$AUI_DIR/node_modules" ]]; then
  echo "Installing assistant-ui deps…"
  (cd "$AUI_DIR" && npm install)
fi

# Write default env if missing.
if [[ ! -f "$AUI_DIR/.env.local" ]]; then
  cat > "$AUI_DIR/.env.local" <<EOF
HERMES_URL=http://${HERMES_HOST}:${HERMES_PORT}
EOF
fi

fuser -k "${AUI_PORT}/tcp" 2>/dev/null || true
sleep 0.2

SESSION="assistant-ui"
tmux_cmd has-session -t "=$SESSION" 2>/dev/null || \
  tmux_cmd new-session -d -s "$SESSION" -c "$AUI_DIR" -- "${SHELL:-bash}" -l
tmux_cmd send-keys -t "${SESSION}:0.0" C-c C-m
sleep 0.2
tmux_cmd send-keys -t "${SESSION}:0.0" \
  "cd '$AUI_DIR' && HERMES_URL='http://${HERMES_HOST}:${HERMES_PORT}' npm run dev -- --hostname 127.0.0.1 --port ${AUI_PORT}" C-m

ok=0
for _ in $(seq 1 120); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 1 "http://127.0.0.1:${AUI_PORT}/" 2>/dev/null || echo 000)
  if [[ "$code" == "200" ]]; then ok=1; break; fi
  sleep 0.5
done

echo
if [[ "$ok" -eq 1 ]]; then
  echo "✓ assistant-ui + Hermes (AG-UI)"
  echo "  UI:     http://127.0.0.1:${AUI_PORT}/"
  echo "  Hermes: http://${HERMES_HOST}:${HERMES_PORT}/api/health"
  echo "  AG-UI:  http://127.0.0.1:${AUI_PORT}/agui  (rewrite → Hermes)"
  echo
  echo "Open http://127.0.0.1:${AUI_PORT}/ (forward port ${AUI_PORT} if remote)."
else
  echo "assistant-ui failed to become ready on :${AUI_PORT}" >&2
  echo "Check tmux session '$SESSION'." >&2
  exit 1
fi
