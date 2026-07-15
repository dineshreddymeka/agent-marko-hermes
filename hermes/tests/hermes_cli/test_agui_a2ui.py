"""Unit tests for A2UI envelope extraction helpers."""

from __future__ import annotations

import json

from hermes_cli.agui_a2ui import extract_a2ui_messages, tool_result_content_for_client


def test_extract_nested_a2ui_envelope():
    result = {
        "content": "Need details",
        "a2ui": {
            "surfaceId": "doc-1",
            "component": {
                "id": "form",
                "type": "hermes:DocumentRequestForm",
                "props": {"topic": "Q1"},
            },
            "complete": True,
        },
    }
    msgs = extract_a2ui_messages(result)
    assert len(msgs) == 1
    assert msgs[0]["surfaceId"] == "doc-1"
    assert msgs[0]["component"]["type"] == "hermes:DocumentRequestForm"
    assert tool_result_content_for_client(result) == "Need details"


def test_extract_from_json_string():
    payload = json.dumps(
        {
            "a2ui": {
                "surfaceId": "cron-1",
                "component": {
                    "type": "hermes:CronSchedulePicker",
                    "props": {"schedule": "0 9 * * *"},
                },
            }
        }
    )
    msgs = extract_a2ui_messages(payload)
    assert len(msgs) == 1
    assert msgs[0]["component"]["id"] == "hermes-CronSchedulePicker"


def test_extract_a2ui_messages_list():
    result = {
        "a2uiMessages": [
            {
                "surfaceId": "s1",
                "component": {"id": "a", "type": "Text", "props": {"text": "hi"}},
            },
            {
                "surfaceId": "s1",
                "component": {"id": "b", "type": "Button", "props": {"label": "Go"}},
            },
        ]
    }
    msgs = extract_a2ui_messages(result)
    assert len(msgs) == 2
    assert msgs[0]["surfaceId"] == "s1"
    assert msgs[1]["component"]["id"] == "b"


def test_extract_multiple_dynamic_forms_from_tool():
    from tools.a2ui_render_tool import a2ui_render_tool

    components = [
        {
            "id": "contact-form",
            "type": "hermes:DynamicForm",
            "props": {
                "title": "Contact",
                "fields": [{"name": "email", "label": "Email", "type": "email"}],
            },
        },
        {
            "id": "survey-form",
            "type": "hermes:DynamicForm",
            "props": {
                "title": "Survey",
                "fields": [{"name": "rating", "label": "Rating", "type": "number"}],
            },
        },
        {
            "id": "intake-form",
            "type": "hermes:DynamicForm",
            "props": {
                "title": "App intake",
                "fields": [{"name": "goal", "label": "Goal", "type": "textarea"}],
            },
        },
    ]
    raw = a2ui_render_tool({"components": components, "message": "Three forms ready."})
    msgs = extract_a2ui_messages(raw)
    assert len(msgs) == 3
    assert all(m["surfaceId"] == msgs[0]["surfaceId"] for m in msgs)
    assert [m["component"]["type"] for m in msgs] == [
        "hermes:DynamicForm",
        "hermes:DynamicForm",
        "hermes:DynamicForm",
    ]
    assert [m["component"]["id"] for m in msgs] == [
        "contact-form",
        "survey-form",
        "intake-form",
    ]
