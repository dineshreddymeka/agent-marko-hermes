# Hermes WebUI (third-party) + this repo

Free, open-source browser UI for Hermes Agent from
[nesquena/hermes-webui](https://github.com/nesquena/hermes-webui) (MIT).

This is the **chosen** Open-WebUI-like path for Hermes in this workspace:
third-party, not Agent-Marko, not CopilotKit.

## Architecture

```text
Browser → Hermes WebUI (:8787)
              │  uses HERMES_HOME + agent checkout
              ▼
         Hermes Agent (this repo’s hermes/)
```

Hermes WebUI talks to your **local Hermes agent install / source tree**
(`HERMES_WEBUI_AGENT_DIR`). It does **not** use:

- Marko UI (`ui/`)
- AG-UI (`POST /agui`)
- A2UI generative forms
- CopilotKit
- Hermes OpenAI API server (`:8642/v1`) for its primary chat path

## Quick start

From the monorepo root:

```bash
bash scripts/start-hermes-webui.sh
# → http://127.0.0.1:8787/
```

The script:

1. Clones `nesquena/hermes-webui` into `.deps/hermes-webui` (gitignored) if missing
2. Points `HERMES_WEBUI_AGENT_DIR` at [`hermes/`](../hermes/)
3. Runs `python3 bootstrap.py --foreground` on `127.0.0.1:8787`
4. Probes `/health`

### Manual launch

```bash
git clone https://github.com/nesquena/hermes-webui.git .deps/hermes-webui
cd .deps/hermes-webui
export HERMES_WEBUI_AGENT_DIR="$(pwd)/../../hermes"
export HERMES_WEBUI_SKIP_ONBOARDING=1
python3 bootstrap.py --foreground --host 127.0.0.1 --port 8787
```

Useful env vars (upstream):

| Variable | Purpose |
|----------|---------|
| `HERMES_WEBUI_AGENT_DIR` | Path to Hermes Agent (`run_agent.py` root) |
| `HERMES_WEBUI_PORT` | Default `8787` |
| `HERMES_WEBUI_HOST` | Default `127.0.0.1` |
| `HERMES_WEBUI_SKIP_ONBOARDING` | `1` to skip first-run wizard |
| `HERMES_HOME` | Hermes profile/config home (`~/.hermes`) |
| `HERMES_WEBUI_PASSWORD` | Optional password gate |

Configure a model/provider under `~/.hermes` (or run Hermes setup) so chat can complete. Without a provider, the UI still loads; turns may fail until keys exist.

## Protocol note (AG-UI / A2UI)

**Hermes WebUI does not speak AG-UI or A2UI.** Streaming chat and tools are handled by WebUI’s own Python API over the Hermes agent core.

If you need AG-UI + A2UI:

- Use this repo’s Marko UI (`bash scripts/start-hermes-ui.sh` → `:9119`), or
- Build on [assistant-ui](https://github.com/assistant-ui/assistant-ui) / CopilotKit OSS against Hermes `/agui` (separate work)

## Alternatives (also free, also no AG-UI/A2UI)

| Project | Path |
|---------|------|
| [Open WebUI](https://github.com/open-webui/open-webui) | Point at Hermes API server `:8642/v1` |
| [EKKOLearnAI/hermes-studio](https://github.com/EKKOLearnAI/hermes-studio) | Desktop / web console |
| [outsourc-e/hermes-workspace](https://github.com/outsourc-e/hermes-workspace) | Workspace-style UI |

## Smoke checks

```bash
curl -sS http://127.0.0.1:8787/health
# expect HTTP 200

curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8787/
# expect 200
```
