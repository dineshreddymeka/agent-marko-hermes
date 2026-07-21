#!/usr/bin/env bash
# Start the Vite dev server in the background (stop with scripts/dev-stop.sh).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PORT="${PORT:-5173}"
HOST="${HOST:-127.0.0.1}"
PID_FILE="$ROOT/.dev-server.pid"
LOG_FILE="$ROOT/.dev-server.log"
VITE_BIN="$ROOT/node_modules/.bin/vite"
DEPS_STAMP="$ROOT/node_modules/.deps-installed"

if ! command -v node >/dev/null 2>&1; then
  echo "[dev-start] Node.js is not installed. Install it from https://nodejs.org/ or use nvm, then retry."
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "[dev-start] npm is not available (usually bundled with Node.js). Install Node.js, then retry."
  exit 1
fi

needs_npm_install=false
if [[ ! -d "$ROOT/node_modules" ]]; then
  needs_npm_install=true
elif [[ ! -f "$DEPS_STAMP" ]]; then
  needs_npm_install=true
elif [[ "$ROOT/package.json" -nt "$DEPS_STAMP" ]] || { [[ -f "$ROOT/package-lock.json" ]] && [[ "$ROOT/package-lock.json" -nt "$DEPS_STAMP" ]]; }; then
  needs_npm_install=true
elif [[ ! -x "$VITE_BIN" ]]; then
  needs_npm_install=true
fi

if [[ "$needs_npm_install" == true ]]; then
  echo "[dev-start] Installing or updating npm dependencies…"
  npm install
  mkdir -p "$ROOT/node_modules"
  touch "$DEPS_STAMP"
fi

if [[ ! -x "$VITE_BIN" ]]; then
  echo "[dev-start] Vite not found under node_modules after npm install. Check package.json and errors above."
  exit 1
fi

if [[ -f "$PID_FILE" ]]; then
  pid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null; then
    echo "[dev-start] Already running (PID $pid). Open http://${HOST}:${PORT}"
    exit 0
  fi
  rm -f "$PID_FILE"
fi

echo "[dev-start] Starting Vite on http://${HOST}:${PORT} …"
nohup "$VITE_BIN" --host "$HOST" --port "$PORT" >>"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"

sleep 0.4
if ! kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "[dev-start] Server exited immediately. Last log lines:"
  tail -n 20 "$LOG_FILE" 2>/dev/null || true
  rm -f "$PID_FILE"
  exit 1
fi

echo "[dev-start] PID $(cat "$PID_FILE"). Log: $LOG_FILE"
echo "[dev-start] Open http://${HOST}:${PORT}"
