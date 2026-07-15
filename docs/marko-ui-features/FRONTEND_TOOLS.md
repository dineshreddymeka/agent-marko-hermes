# Frontend Tools — Detailed Implementation

## Goal

Some tools must run **in the browser** (open a panel, set theme, preview a file). Hermes exposes their schemas to the model when `HERMES_PLATFORM=marko`, returns an ack immediately, and Marko executes on `TOOL_CALL_END`.

## Backend

### Registration

**File:** `hermes/tools/a2ui_render_tool.py`

```python
def check_marko_frontend_tools() -> bool:
    return (os.environ.get("HERMES_PLATFORM") or "").strip().lower() == "marko"

def _frontend_ack(name: str, args: dict) -> str:
    return json.dumps({
        "content": f"Frontend tool '{name}' dispatched to Marko client.",
        "frontendTool": name,
        "args": args,
        "executedOnClient": True,
    })
```

Register:

| Tool | Args | Effect on client |
|------|------|------------------|
| `open_file_preview` | `{ path }` | Open workspace preview |
| `switch_panel` | `{ panel }` | Switch IconRail panel |
| `render_chart` | `{ data: number[] }` | Render SVG chart in tool card |
| `set_theme` | `{ theme: dark\|dim\|light }` | Apply theme |

Panel enum: `sessions`, `workspace`, `skills`, `memory`, `connections`, `office`, `briefing`, `cron`, `profiles`, `settings`.

### AG-UI visibility

During `/agui`, set `HERMES_PLATFORM=marko` so `check_fn` returns true and schemas appear in the agent tool list.

Also pass Marko frontend tool schemas in the AG-UI `tools` array from the client (`getFrontendTools()`).

## Frontend

### Schemas + executors

**File:** `ui/src/lib/agui/frontend-tools.ts`

```ts
export function getFrontendTools(): Tool[] { /* AG-UI tool defs */ }
export function isFrontendTool(name: string): boolean { … }
export async function executeFrontendTool(name: string, args: unknown): Promise<void> { … }
```

### Dispatch on TOOL_CALL_END

**File:** `ui/src/lib/agui/dispatcher.ts`

```ts
case TOOL_CALL_END:
  if (isFrontendTool(toolName)) {
    await executeFrontendTool(toolName, parsedArgs)
  }
```

### Executors map to UI store

| Tool | Store / action |
|------|----------------|
| `open_file_preview` | `ui.setWorkspacePreviewPath(path)` + ensure workspace panel |
| `switch_panel` | `ui.setActivePanel(panel)` + navigate `/panel/$name` if needed |
| `set_theme` | `settings.setTheme` / `ui.cycleTheme` target |
| `render_chart` | attach chart payload to tool call card / inline SVG |

## Implementation steps

1. Define four tool schemas (name, description, JSON parameters).
2. Backend handlers return `_frontend_ack` only (no server side-effect required).
3. Gate with `HERMES_PLATFORM=marko`.
4. Client registers schemas on each `runAgent` input.
5. On `TOOL_CALL_END`, parse args JSON and execute.
6. Show tool card label via `ui/src/lib/labels.ts` (`open_file_preview` → “Open file preview”).

## Acceptance

- [ ] Tools appear only on Marko AG-UI runs.
- [ ] `switch_panel` changes the right-hand / rail panel.
- [ ] `open_file_preview` opens a file in Workspace.
- [ ] `set_theme` changes `data-theme` immediately.
- [ ] Backend never blocks waiting for client execution.

## Reference files

| Layer | Path |
|-------|------|
| Tool defs | `hermes/tools/a2ui_render_tool.py` |
| Toolset | `hermes/toolsets.py` (`marko`) |
| Client tools | `ui/src/lib/agui/frontend-tools.ts` |
| Dispatcher | `ui/src/lib/agui/dispatcher.ts` |
| Labels | `ui/src/lib/labels.ts` |
| UI store | `ui/src/stores/ui.ts` |
