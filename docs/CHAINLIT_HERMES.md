# Chainlit UI + Hermes OpenAI proxy

**Branch:** `cursor/chainlit-hermes-e2f3`  
**Status:** alternate frontend — Marko/`ui/` remains in the tree but is **not** the default preview on this branch.

## Architecture

```
Browser → Chainlit (:8000) → Hermes proxy (:8645/v1) → OAuth upstream (Nous / xAI)
```

- Chainlit speaks OpenAI `chat.completions` (streaming).
- `hermes proxy start` accepts any bearer and attaches your real OAuth credential per request.
- No secrets in git: use placeholder `OPENAI_API_KEY=hermes-proxy`.

## Quick start

```bash
bash scripts/start-chainlit-hermes.sh
# Local:  http://127.0.0.1:8000/
# Public: printed trycloudflare.com URL (OPEN_TUNNEL=1 by default)
```

Skip tunnel:

```bash
OPEN_TUNNEL=0 bash scripts/start-chainlit-hermes.sh
```

### Auth (required for chat)

```bash
cd hermes
PYTHONPATH=. python3 -m hermes_cli.main proxy status
PYTHONPATH=. python3 -m hermes_cli.main auth add nous   # or xai
```

Then restart the start script (or only the `hermes-proxy` tmux session).

### Env knobs

| Variable | Default | Meaning |
|----------|---------|---------|
| `HERMES_PROXY_PORT` | `8645` | Proxy listen port |
| `HERMES_PROXY_PROVIDER` | `nous` | `nous` or `xai` |
| `CHAINLIT_PORT` | `8000` | Chainlit UI port |
| `OPENAI_API_KEY` | `hermes-proxy` | Any non-empty client bearer |
| `HERMES_PROXY_MODEL` | `default` | Model id sent to upstream |
| `OPEN_TUNNEL` | `1` | Cloudflare quick tunnel |

## Files

| Path | Role |
|------|------|
| [`chainlit_app/app.py`](../chainlit_app/app.py) | Chainlit → AsyncOpenAI → Hermes proxy |
| [`chainlit_app/requirements.txt`](../chainlit_app/requirements.txt) | `chainlit`, `openai` |
| [`scripts/start-chainlit-hermes.sh`](../scripts/start-chainlit-hermes.sh) | proxy + Chainlit + tunnel |

## Marko

One-hop Marko (`bash scripts/start-hermes-ui.sh` → `:9119`) is unchanged on `master`. This branch’s default is Chainlit + proxy.
