"""Helpers to extract and normalize A2UI payloads for AG-UI SSE emission."""

from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional


def _as_dict(value: Any) -> Optional[Dict[str, Any]]:
    if isinstance(value, dict):
        return value
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            parsed = json.loads(text)
        except Exception:
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def _normalize_component_entry(
    component: Any,
    *,
    data: Dict[str, Any],
    default_surface: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    if not isinstance(component, dict):
        return None
    ctype = component.get("type")
    if not isinstance(ctype, str) or not ctype.strip():
        return None

    surface_id = data.get("surfaceId") or data.get("surface_id") or default_surface
    if not isinstance(surface_id, str) or not surface_id.strip():
        surface_id = f"a2ui-{uuid.uuid4().hex[:12]}"

    cid = component.get("id")
    if not isinstance(cid, str) or not cid.strip():
        cid = ctype.replace(":", "-")
    props = component.get("props")
    if not isinstance(props, dict):
        props = {}

    payload: Dict[str, Any] = {
        "surfaceId": surface_id.strip(),
        "component": {
            "id": cid.strip(),
            "type": ctype.strip(),
            "props": props,
        },
        "complete": bool(data.get("complete", True)),
    }
    children = component.get("children")
    if isinstance(children, list):
        payload["component"]["children"] = [str(c) for c in children if c is not None]
    extra = data.get("data")
    if isinstance(extra, dict) and extra:
        payload["data"] = extra
    return payload


def _normalize_message(raw: Any, *, default_surface: Optional[str] = None) -> List[Dict[str, Any]]:
    data = _as_dict(raw)
    if data is None:
        return []

    # Accept either the wire value shape or a nested {a2ui: {...}}.
    if "component" not in data and "components" not in data and isinstance(data.get("a2ui"), dict):
        data = data["a2ui"]

    surface_id = data.get("surfaceId") or data.get("surface_id") or default_surface
    if isinstance(surface_id, str) and surface_id.strip():
        default_surface = surface_id.strip()

    components = data.get("components")
    if isinstance(components, list) and components:
        out: List[Dict[str, Any]] = []
        for item in components:
            normalized = _normalize_component_entry(
                item, data=data, default_surface=default_surface
            )
            if normalized:
                default_surface = normalized["surfaceId"]
                out.append(normalized)
        if out:
            return out

    component = data.get("component")
    if isinstance(component, dict):
        normalized = _normalize_component_entry(
            component, data=data, default_surface=default_surface
        )
        if normalized:
            return [normalized]
    return []


def extract_a2ui_messages(result: Any) -> List[Dict[str, Any]]:
    """Pull zero-or-more A2UI message payloads from a tool result."""
    data = _as_dict(result)
    if data is None:
        return []

    messages: List[Dict[str, Any]] = []
    default_surface = None

    if isinstance(data.get("a2uiMessages"), list):
        for item in data["a2uiMessages"]:
            for normalized in _normalize_message(item, default_surface=default_surface):
                default_surface = normalized["surfaceId"]
                messages.append(normalized)
        return messages

    if "a2ui" in data:
        for normalized in _normalize_message(data.get("a2ui")):
            messages.append(normalized)
        return messages

    # Bare a2ui.message value
    for normalized in _normalize_message(data):
        messages.append(normalized)
    return messages


def tool_result_content_for_client(result: Any) -> str:
    """Prefer human-readable content from A2UI envelopes; else stringify."""
    data = _as_dict(result)
    if data is not None:
        content = data.get("content")
        if isinstance(content, str) and content.strip():
            return content
        if "a2ui" in data or "a2uiMessages" in data:
            return "Interactive UI ready."
        try:
            return json.dumps(data, ensure_ascii=False, default=str)
        except Exception:
            return str(result)
    if isinstance(result, str):
        return result
    try:
        return json.dumps(result, ensure_ascii=False, default=str)
    except Exception:
        return str(result)
