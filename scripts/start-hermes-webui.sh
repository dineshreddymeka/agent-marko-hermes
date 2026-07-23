#!/usr/bin/env bash
# Start third-party Hermes WebUI (nesquena/hermes-webui) against this repo's hermes/.
# Does NOT use Marko, AG-UI, A2UI, or CopilotKit.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPS_DIR="${HERMES_WEBUI_CLONE_DIR:-$ROOT/.deps/hermes-webui}"
AGENT_DIR="${HERMES_WEBUI_AGENT_DIR:-$ROOT/hermes}"
HOST="${HERMES_WEBUI_HOST:-127.0.0.1}"
PORT="${HERMES_WEBUI_PORT:-8787}"

# Prefer this repo's Hermes venv when present (has AIAgent + WebUI deps).
if [[ -z "${HERMES_WEBUI_PYTHON:-}" && -x "$AGENT_DIR/.venv/bin/python" ]]; then
  HERMES_WEBUI_PYTHON="$AGENT_DIR/.venv/bin/python"
fi

TMUX_CFG="/exec-daemon/tmux.portal.conf"
[[ -f "$TMUX_CFG" ]] || TMUX_CFG=""
tmux_cmd() {
  if [[ -n "$TMUX_CFG" ]]; then tmux -f "$TMUX_CFG" "$@"; else tmux "$@"; fi
}

if [[ ! -f "$AGENT_DIR/run_agent.py" ]]; then
  echo "Hermes agent not found at $AGENT_DIR (expected run_agent.py)" >&2
  exit 1
fi

if [[ ! -f "$DEPS_DIR/bootstrap.py" ]]; then
  echo "Cloning nesquena/hermes-webui → $DEPS_DIR"
  mkdir -p "$(dirname "$DEPS_DIR")"
  git clone --depth 1 https://github.com/nesquena/hermes-webui.git "$DEPS_DIR"
fi

# Free any prior process on the WebUI port.
fuser -k "${PORT}/tcp" 2>/dev/null || true
for _ in $(seq 1 40); do
  if ! (command -v ss >/dev/null && ss -ltn 2>/dev/null | grep -q ":${PORT} "); then
    break
  fi
  sleep 0.05
done

export HERMES_WEBUI_AGENT_DIR="$AGENT_DIR"
export HERMES_WEBUI_HOST="$HOST"
export HERMES_WEBUI_PORT="$PORT"
export HERMES_WEBUI_SKIP_ONBOARDING="${HERMES_WEBUI_SKIP_ONBOARDING:-1}"
export HERMES_WEBUI_FOREGROUND=1
export PYTHONPATH="${AGENT_DIR}${PYTHONPATH:+:$PYTHONPATH}"
if [[ -n "${HERMES_WEBUI_PYTHON:-}" ]]; then
  export HERMES_WEBUI_PYTHON
fi

SESSION="hermes-webui"
tmux_cmd has-session -t "=$SESSION" 2>/dev/null || \
  tmux_cmd new-session -d -s "$SESSION" -c "$DEPS_DIR" -- "${SHELL:-bash}" -l
tmux_cmd send-keys -t "${SESSION}:0.0" C-c C-m
sleep 0.2

# Port is positional (not --port). See upstream bootstrap.py parse_args().
# Use a small launcher script so quoting stays simple across tmux send-keys.
LAUNCHER="$DEPS_DIR/.cursor-launch-webui.sh"
cat > "$LAUNCHER" <<EOF
#!/usr/bin/env bash
set -euo pipefail
cd "$DEPS_DIR"
export HERMES_WEBUI_AGENT_DIR="$AGENT_DIR"
export HERMES_WEBUI_HOST="$HOST"
export HERMES_WEBUI_PORT="$PORT"
export HERMES_WEBUI_SKIP_ONBOARDING="$HERMES_WEBUI_SKIP_ONBOARDING"
export HERMES_WEBUI_FOREGROUND=1
export PYTHONPATH="$AGENT_DIR\${PYTHONPATH:+:\$PYTHONPATH}"
EOF
if [[ -n "${HERMES_WEBUI_PYTHON:-}" ]]; then
  echo "export HERMES_WEBUI_PYTHON=\"$HERMES_WEBUI_PYTHON\"" >> "$LAUNCHER"
fi
cat >> "$LAUNCHER" <<EOF
exec python3 bootstrap.py --foreground --host "$HOST" --no-browser --skip-agent-install $PORT
EOF
chmod +x "$LAUNCHER"

tmux_cmd send-keys -t "${SESSION}:0.0" "bash '$LAUNCHER'" C-m

ok=0
# Bootstrap may create a venv and install deps on first run — allow several minutes.
for _ in $(seq 1 360); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 1 "http://${HOST}:${PORT}/health" 2>/dev/null || echo 000)
  if [[ "$code" == "200" ]]; then
    ok=1
    break
  fi
  sleep 0.5
done

echo
if [[ "$ok" -eq 1 ]]; then
  echo "✓ Hermes WebUI ready (third-party OSS — no AG-UI / no A2UI)"
  echo "  UI:     http://${HOST}:${PORT}/"
  echo "  Health: http://${HOST}:${PORT}/health"
  echo "  Agent:  $AGENT_DIR"
  echo "  Clone:  $DEPS_DIR"
  echo "  Python: ${HERMES_WEBUI_PYTHON:-system python3}"
  echo
  echo "Open http://${HOST}:${PORT}/ (forward port ${PORT} if remote)."
  echo "Chat uses Hermes CLI/agent APIs — not Marko /agui and not CopilotKit."
else
  echo "Hermes WebUI failed to become healthy on http://${HOST}:${PORT}/health" >&2
  echo "Check tmux session '$SESSION' logs." >&2
  exit 1
fi
