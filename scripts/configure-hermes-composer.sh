#!/usr/bin/env bash
# Point Hermes at the local Composer OpenAI-compatible proxy (cursor-agent-api).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export PATH="${ROOT}/scripts/bin:${HOME}/.local/bin:${PATH}"

PORT="${COMPOSER_PROXY_PORT:-4646}"
BASE_URL="${HERMES_COMPOSER_PROXY_URL:-http://127.0.0.1:${PORT}/v1}"
# Proxy advertises composer-1.5 / auto; override with HERMES_MODEL if needed.
MODEL="${HERMES_MODEL:-auto}"
API_KEY="${OPENAI_API_KEY:-${CURSOR_API_KEY:-not-needed}}"

# Persist for aioncore-spawned hermes (loads ~/.hermes/.env)
HERMES_HOME="${HERMES_HOME:-${HOME}/.hermes}"
mkdir -p "$HERMES_HOME"
ENV_FILE="${HERMES_HOME}/.env"
touch "$ENV_FILE"
chmod 600 "$ENV_FILE"
python3 - "$ENV_FILE" "$API_KEY" "$BASE_URL" <<'PY'
from pathlib import Path
import sys
path, key, base = Path(sys.argv[1]), sys.argv[2], sys.argv[3]
wanted = {
    "OPENAI_API_KEY": key,
    "OPENAI_BASE_URL": base,
    # Hermes custom provider also honors these via config; keep key available
    "CURSOR_API_KEY": key if key != "not-needed" else "",
}
lines = path.read_text().splitlines() if path.exists() else []
keys = set(wanted)
out = []
for line in lines:
    k = line.split("=", 1)[0] if "=" in line else ""
    if k in keys:
        continue
    out.append(line)
for k, v in wanted.items():
    if v:
        out.append(f"{k}={v}")
path.write_text("\n".join(out) + "\n")
PY

# custom OpenAI-compatible endpoint → Composer proxy
hermes config set model.provider custom
hermes config set model.default "$MODEL"
hermes config set model.base_url "$BASE_URL"
# store api key in config for custom provider (some paths ignore .env OPENAI_*)
hermes config set model.api_key "$API_KEY" 2>/dev/null || true

# Also register named custom_providers entry when supported
python3 - <<PY
import sys
sys.path.insert(0, "${ROOT}/hermes")
try:
    from hermes_cli.config import load_config, save_config
except Exception as exc:
    print("warn: could not update custom_providers:", exc)
    raise SystemExit(0)
cfg = load_config() or {}
providers = list(cfg.get("custom_providers") or [])
entry = {
    "name": "composer-proxy",
    "base_url": "${BASE_URL}",
    "api_key": "${API_KEY}",
    "model": "${MODEL}",
    "api_mode": "chat_completions",
}
providers = [p for p in providers if (p.get("name") if isinstance(p, dict) else None) != "composer-proxy"]
providers.append(entry)
cfg["custom_providers"] = providers
model = dict(cfg.get("model") or {})
model.update({
    "provider": "custom",
    "default": "${MODEL}",
    "base_url": "${BASE_URL}",
    "api_key": "${API_KEY}",
})
cfg["model"] = model
save_config(cfg)
print("✓ custom_providers += composer-proxy")
PY

PYTHONPATH="${ROOT}/hermes${PYTHONPATH:+:$PYTHONPATH}" python3 - <<PY
import sys
sys.path.insert(0, "${ROOT}/hermes")
from acp_adapter.auth import detect_provider, has_provider
print(f"provider={detect_provider()!r} has_provider={has_provider()}")
sys.exit(0 if has_provider() else 1)
PY

echo "✓ Hermes → Composer proxy"
echo "  base_url: ${BASE_URL}"
echo "  model:    ${MODEL}"
echo "  Start proxy if needed: bash scripts/start-composer-proxy.sh"
