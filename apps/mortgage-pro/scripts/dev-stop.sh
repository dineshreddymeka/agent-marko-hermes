#!/usr/bin/env bash
# Stop the dev server started by scripts/dev-start.sh (and optionally free the dev port).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT/.dev-server.pid"
PORT="${PORT:-5173}"

stopped=false

if [[ -f "$PID_FILE" ]]; then
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
    echo "[dev-stop] Sending SIGTERM to PID $pid…"
    kill "$pid" 2>/dev/null || true
    for _ in {1..15}; do
      if ! kill -0 "$pid" 2>/dev/null; then
        break
      fi
      sleep 0.2
    done
    if kill -0 "$pid" 2>/dev/null; then
      echo "[dev-stop] Process still running; sending SIGKILL…"
      kill -9 "$pid" 2>/dev/null || true
    fi
    stopped=true
    echo "[dev-stop] Stopped PID $pid."
  else
    echo "[dev-stop] PID file present but process $pid is not running."
  fi
  rm -f "$PID_FILE"
else
  echo "[dev-stop] No PID file ($PID_FILE)."
fi

# macOS / Linux: clear anything still listening on the dev port (leftover ng/vite).
if command -v lsof >/dev/null 2>&1; then
  pids="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${pids:-}" ]]; then
    echo "[dev-stop] Freeing port $PORT (PIDs: ${pids//$'\n'/ })…"
    # shellcheck disable=SC2086
    kill ${pids} 2>/dev/null || true
    sleep 0.3
    pids2="$(lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null || true)"
    if [[ -n "${pids2:-}" ]]; then
      # shellcheck disable=SC2086
      kill -9 ${pids2} 2>/dev/null || true
    fi
    stopped=true
  fi
fi

if [[ "$stopped" == false ]]; then
  echo "[dev-stop] Nothing to stop (no PID file and port $PORT not in use)."
else
  echo "[dev-stop] Done."
fi
