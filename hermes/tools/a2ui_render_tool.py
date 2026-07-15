"""Marko AG-UI / A2UI tools — render interactive surfaces and client UI tools.

``a2ui_render`` returns an A2UI envelope that ``hermes_cli.agui_endpoint``
translates into ``CUSTOM a2ui.message`` SSE events for Marko.

Frontend tools (``open_file_preview``, ``switch_panel``, ``render_chart``,
``set_theme``) are schema-visible only when ``HERMES_PLATFORM=marko``. The
Marko client executes them locally on ``TOOL_CALL_END``; Hermes returns a
client-side acknowledgement so the agent loop can continue.
"""

from __future__ import annotations

import json
import os
import uuid
from typing import Any, Dict, List, Optional

from tools.registry import registry, tool_error


def _is_marko_platform() -> bool:
    return (os.environ.get("HERMES_PLATFORM") or "").strip().lower() == "marko"


def check_a2ui_render() -> bool:
    return True


def check_marko_frontend_tools() -> bool:
    return _is_marko_platform()


def _normalize_component(raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None
    ctype = raw.get("type")
    if not isinstance(ctype, str) or not ctype.strip():
        return None
    cid = raw.get("id")
    if not isinstance(cid, str) or not cid.strip():
        cid = ctype.replace(":", "-")
    props = raw.get("props")
    if not isinstance(props, dict):
        props = {}
    component: Dict[str, Any] = {
        "id": cid.strip(),
        "type": ctype.strip(),
        "props": props,
    }
    children = raw.get("children")
    if isinstance(children, list):
        component["children"] = [str(c) for c in children if c is not None]
    return component


def build_a2ui_message(
    *,
    surface_id: Optional[str] = None,
    component: Optional[Dict[str, Any]] = None,
    components: Optional[List[Any]] = None,
    data: Optional[Dict[str, Any]] = None,
    complete: bool = True,
) -> Dict[str, Any]:
    """Build a single ``a2ui.message`` value payload."""
    sid = (surface_id or "").strip() or f"a2ui-{uuid.uuid4().hex[:12]}"
    payload: Dict[str, Any] = {
        "surfaceId": sid,
        "complete": bool(complete),
    }
    if isinstance(data, dict) and data:
        payload["data"] = data

    if component is not None:
        normalized = _normalize_component(component)
        if normalized is None:
            raise ValueError("component must include a string type")
        payload["component"] = normalized
        return payload

    if components:
        # First component is primary; extras are emitted as separate messages
        # by the caller. Keep one component here for tool-result convenience.
        first = _normalize_component(components[0])
        if first is None:
            raise ValueError("components[0] must include a string type")
        payload["component"] = first
        return payload

    raise ValueError("a2ui_render requires component or components")


def a2ui_render_tool(args: Dict[str, Any], **_kwargs: Any) -> str:
    """Return a JSON envelope Marko AG-UI turns into ``a2ui.message`` events."""
    try:
        surface_id = args.get("surfaceId") or args.get("surface_id")
        component = args.get("component")
        components = args.get("components")
        data = args.get("data") if isinstance(args.get("data"), dict) else None
        complete = args.get("complete", True)
        if isinstance(complete, str):
            complete = complete.strip().lower() not in {"0", "false", "no"}

        if component is None and not components:
            # Convenience: treat remaining args as a form widget.
            # Prefer DynamicForm when fields/title look like a fillable form;
            # otherwise default to DocumentRequestForm (legacy).
            ctype = args.get("type")
            if not ctype:
                if args.get("fields") is not None or args.get("title"):
                    ctype = "hermes:DynamicForm"
                else:
                    ctype = "hermes:DocumentRequestForm"
            props = {
                k: v
                for k, v in args.items()
                if k
                not in {
                    "surfaceId",
                    "surface_id",
                    "component",
                    "components",
                    "data",
                    "complete",
                    "type",
                    "message",
                }
            }
            component = {
                "id": str(args.get("id") or "primary"),
                "type": str(ctype),
                "props": props,
            }

        message = build_a2ui_message(
            surface_id=str(surface_id) if surface_id else None,
            component=component if isinstance(component, dict) else None,
            components=components if isinstance(components, list) else None,
            data=data,
            complete=bool(complete),
        )
        content = args.get("message") or args.get("content") or "Interactive UI ready."
        envelope = {
            "content": str(content),
            "a2ui": message,
        }
        # Allow multi-component surfaces in one call.
        if isinstance(components, list) and len(components) > 1:
            extras: List[Dict[str, Any]] = []
            for idx, raw in enumerate(components[1:], start=1):
                normalized = _normalize_component(raw)
                if normalized is None:
                    continue
                extras.append(
                    build_a2ui_message(
                        surface_id=message["surfaceId"],
                        component=normalized,
                        complete=bool(complete),
                    )
                )
            if extras:
                envelope["a2uiMessages"] = [message, *extras]
        return json.dumps(envelope, ensure_ascii=False)
    except Exception as exc:
        return tool_error(str(exc))


def _frontend_ack(name: str, args: Dict[str, Any]) -> str:
    return json.dumps(
        {
            "content": f"Frontend tool '{name}' dispatched to Marko client.",
            "frontendTool": name,
            "args": args,
            "executedOnClient": True,
        },
        ensure_ascii=False,
    )


def open_file_preview_tool(args: Dict[str, Any], **_kwargs: Any) -> str:
    return _frontend_ack("open_file_preview", args)


def switch_panel_tool(args: Dict[str, Any], **_kwargs: Any) -> str:
    return _frontend_ack("switch_panel", args)


def render_chart_tool(args: Dict[str, Any], **_kwargs: Any) -> str:
    return _frontend_ack("render_chart", args)


def set_theme_tool(args: Dict[str, Any], **_kwargs: Any) -> str:
    return _frontend_ack("set_theme", args)


A2UI_RENDER_SCHEMA = {
    "name": "a2ui_render",
    "description": (
        "Render an interactive A2UI surface in the Marko chat UI. ALWAYS use this "
        "when the user asks for a form, questionnaire, survey, intake, contact form, "
        "or any fillable UI in chat. NEVER dump HTML/CSS form code as plain text — "
        "the Marko UI does not execute HTML from chat messages. "
        "For a ready-to-fill form use hermes:DynamicForm with title + fields "
        "[{name,label,type,required,options?}]. Types: text, email, textarea, select, "
        "checkbox, number. For document/PPT requests use hermes:DocumentRequestForm. "
        "For cron scheduling use hermes:CronSchedulePicker. Also supports "
        "hermes:FormRequestForm, hermes:MemoryEntryEditor, hermes:SkillCard, "
        "hermes:FileDiff, and standard widgets (TextField, Select, Button, Card)."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "surfaceId": {
                "type": "string",
                "description": "Stable surface id; reuse to update an existing surface.",
            },
            "message": {
                "type": "string",
                "description": "Optional assistant-facing summary shown with the surface.",
            },
            "complete": {
                "type": "boolean",
                "description": "Mark the surface complete (default true).",
                "default": True,
            },
            "data": {
                "type": "object",
                "description": "Optional surface-level data bag.",
            },
            "component": {
                "type": "object",
                "description": "Primary A2UI component {id, type, props, children?}",
                "properties": {
                    "id": {"type": "string"},
                    "type": {"type": "string"},
                    "props": {"type": "object"},
                    "children": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
                "required": ["type"],
            },
            "components": {
                "type": "array",
                "description": "Optional list of components for one surface.",
                "items": {"type": "object"},
            },
        },
        "required": [],
    },
}

FRONTEND_PANEL_ENUM = [
    "sessions",
    "workspace",
    "skills",
    "memory",
    "connections",
    "office",
    "briefing",
    "cron",
    "profiles",
    "settings",
]

registry.register(
    name="a2ui_render",
    toolset="marko",
    schema=A2UI_RENDER_SCHEMA,
    handler=a2ui_render_tool,
    check_fn=check_a2ui_render,
    emoji="🧩",
)

registry.register(
    name="open_file_preview",
    toolset="marko",
    schema={
        "name": "open_file_preview",
        "description": "Open a workspace file in the Marko preview panel.",
        "parameters": {
            "type": "object",
            "properties": {"path": {"type": "string"}},
            "required": ["path"],
        },
    },
    handler=open_file_preview_tool,
    check_fn=check_marko_frontend_tools,
    emoji="📄",
)

registry.register(
    name="switch_panel",
    toolset="marko",
    schema={
        "name": "switch_panel",
        "description": "Switch the Marko right-hand panel.",
        "parameters": {
            "type": "object",
            "properties": {
                "panel": {"type": "string", "enum": FRONTEND_PANEL_ENUM},
            },
            "required": ["panel"],
        },
    },
    handler=switch_panel_tool,
    check_fn=check_marko_frontend_tools,
    emoji="🗂️",
)

registry.register(
    name="render_chart",
    toolset="marko",
    schema={
        "name": "render_chart",
        "description": "Render a lightweight SVG bar chart in the Marko UI.",
        "parameters": {
            "type": "object",
            "properties": {
                "data": {"type": "array", "items": {"type": "number"}},
            },
            "required": ["data"],
        },
    },
    handler=render_chart_tool,
    check_fn=check_marko_frontend_tools,
    emoji="📊",
)

registry.register(
    name="set_theme",
    toolset="marko",
    schema={
        "name": "set_theme",
        "description": "Set Marko UI theme to dark, dim, or light.",
        "parameters": {
            "type": "object",
            "properties": {
                "theme": {"type": "string", "enum": ["dark", "dim", "light"]},
            },
            "required": ["theme"],
        },
    },
    handler=set_theme_tool,
    check_fn=check_marko_frontend_tools,
    emoji="🎨",
)
