"""Minimal smoke: a2ui_render DynamicForm envelope → extract_a2ui_messages."""

from __future__ import annotations

import json
import os

from hermes_cli.agui_a2ui import extract_a2ui_messages


def test_dynamic_form_envelope_yields_payload():
    os.environ["HERMES_PLATFORM"] = "marko"
    import tools.a2ui_render_tool  # noqa: F401 — register handler
    from tools.a2ui_render_tool import a2ui_render_tool

    raw = a2ui_render_tool(
        {
            "title": "Contact us",
            "description": "We will reply soon.",
            "fields": [
                {
                    "name": "email",
                    "label": "Email",
                    "type": "email",
                    "required": True,
                },
                {
                    "name": "message",
                    "label": "Message",
                    "type": "textarea",
                },
            ],
            "submitLabel": "Send",
        }
    )
    assert isinstance(raw, str) and raw.strip().startswith("{")
    parsed = json.loads(raw)
    assert parsed.get("a2ui", {}).get("component", {}).get("type") == "hermes:DynamicForm"

    msgs = extract_a2ui_messages(raw)
    assert len(msgs) >= 1
    assert msgs[0]["component"]["type"] == "hermes:DynamicForm"
    assert msgs[0]["component"]["props"]["title"] == "Contact us"
