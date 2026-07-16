# Open WebUI + Hermes agent backend

**Branch:** `cursor/chainlit-hermes-e2f3` (shared alternate-UI branch)  
**UI:** Open WebUI left sidebar (chats / workspace) **plus** Hermes left-rail shell with Marko panel actions.  
**Backend:** Hermes **API server** (`gateway` + `API_SERVER_ENABLED`) — full agent tools, not the OAuth-only `hermes proxy`.

## Architecture

```
Browser
  ├─ Shell :3200  (Hermes left rail → panels + Open WebUI iframe)
  └─ Open WebUI :3000  ──POST /v1/chat/completions──►  Hermes API :8642
                                                         └─ AIAgent + tools
```

Open WebUI’s own left panel manages chats. The Hermes shell left panel exposes **Sessions, Workspace, Skills, Memory, Connections (MCP/Gateway), Office, Cron, Kanban, Profiles, Settings** via the Marko/Hermes dashboard (`:9119`).

## Quick start

```bash
bash scripts/start-openwebui-hermes.sh
# Shell:      http://127.0.0.1:3200/
# Open WebUI: http://127.0.0.1:3000/
# API:        http://127.0.0.1:8642/v1  (Bearer hermes-openwebui)
```

`OPEN_TUNNEL=1` (default) prints Cloudflare URLs for remote access.

### First Open WebUI visit

1. Open the shell or `:3000`.
2. Create admin account if prompted (`WEBUI_AUTH=false` skips login on fresh installs when supported).
3. Model dropdown should list **`hermes-agent`**.
4. Chat — tool progress streams inline from Hermes.

If models are empty: Admin → Connections → OpenAI URL `http://127.0.0.1:8642/v1`, key `hermes-openwebui`.

### LLM provider

API server uses Hermes model config (`~/.hermes/config.yaml`). This environment defaults to **GitHub Copilot** if `gh` auth is in the credential pool. Override with `hermes model` / provider keys as needed.

## Files

| Path | Role |
|------|------|
| [`openwebui_app/index.html`](../openwebui_app/index.html) | Left-rail shell |
| [`openwebui_app/serve_shell.py`](../openwebui_app/serve_shell.py) | Serves shell on `:3200` |
| [`scripts/start-openwebui-hermes.sh`](../scripts/start-openwebui-hermes.sh) | API server + OWUI + shell + tunnel |

## Related

- Chainlit + OAuth proxy: [CHAINLIT_HERMES.md](./CHAINLIT_HERMES.md)
- Marko one-hop: `bash scripts/start-hermes-ui.sh`
