#!/usr/bin/env bash
# Non-interactive Hermes provider config for AionUi ACP chat.
# Requires one of: OPENROUTER_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${ROOT}/scripts/bin:${HOME}/.local/bin:${PATH}"

if [[ -n "${OPENROUTER_API_KEY:-}" ]]; then
  PROVIDER=openrouter
  MODEL="${HERMES_MODEL:-anthropic/claude-sonnet-4}"
  KEY_VAR=OPENROUTER_API_KEY
elif [[ -n "${OPENAI_API_KEY:-}" ]]; then
  PROVIDER=openai
  MODEL="${HERMES_MODEL:-gpt-4.1}"
  KEY_VAR=OPENAI_API_KEY
elif [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  PROVIDER=anthropic
  MODEL="${HERMES_MODEL:-claude-sonnet-4}"
  KEY_VAR=ANTHROPIC_API_KEY
else
  echo "error: no LLM API key in environment" >&2
  echo "  export OPENROUTER_API_KEY=...   # preferred" >&2
  echo "  # or OPENAI_API_KEY / ANTHROPIC_API_KEY" >&2
  echo "  then: bash scripts/configure-hermes-provider.sh" >&2
  exit 1
fi

# Persist key into ~/.hermes/.env so aioncore-spawned hermes can see it
# (aioncore clears PATH but keeps a mostly empty env — .env is loaded by Hermes).
HERMES_HOME="${HERMES_HOME:-${HOME}/.hermes}"
mkdir -p "$HERMES_HOME"
ENV_FILE="${HERMES_HOME}/.env"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"
if grep -q "^${KEY_VAR}=" "$ENV_FILE" 2>/dev/null; then
  # replace in-place
  python3 - "$ENV_FILE" "$KEY_VAR" "${!KEY_VAR}" <<'PY'
import pathlib,sys
path, key, val = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
lines=[]
found=False
for line in path.read_text().splitlines():
    if line.startswith(key+"="):
        lines.append(f"{key}={val}")
        found=True
    else:
        lines.append(line)
if not found:
    lines.append(f"{key}={val}")
path.write_text("\n".join(lines) + "\n")
PY
else
  printf '%s=%s\n' "$KEY_VAR" "${!KEY_VAR}" >> "$ENV_FILE"
fi

hermes config set model.provider "$PROVIDER"
hermes config set model.default "$MODEL"

PYTHONPATH="${ROOT}/hermes${PYTHONPATH:+:$PYTHONPATH}" python3 - <<PY
import sys
sys.path.insert(0, "${ROOT}/hermes")
from acp_adapter.auth import detect_provider, has_provider
p = detect_provider()
print(f"provider={p!r} has_provider={has_provider()}")
sys.exit(0 if has_provider() else 1)
PY

echo "✓ Hermes provider configured (${PROVIDER} / ${MODEL})"
echo "  Re-open AionUi chat (or re-run: bash scripts/seed-aionui-hermes.sh)"
