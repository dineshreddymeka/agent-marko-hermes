"""In-process AG-UI SSE endpoint for Agent-Marko UI.

Browser → Hermes FastAPI only (no Bun middle layer). Streams AG-UI events
while driving ``AIAgent.run_conversation``. Emits text, thinking, tools,
and ``CUSTOM a2ui.message`` surfaces for full Marko AG-UI + A2UI support.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import queue
import threading
import uuid
from typing import Any, AsyncIterator, Dict, List, Optional

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from hermes_cli.agui_a2ui import extract_a2ui_messages, tool_result_content_for_client

_log = logging.getLogger("hermes.agui")

router = APIRouter(tags=["agui"])


class AguiMessage(BaseModel):
    id: Optional[str] = None
    role: str = "user"
    content: Optional[Any] = None
    name: Optional[str] = None
    toolCallId: Optional[str] = None


class RunAgentInput(BaseModel):
    threadId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    runId: str = Field(default_factory=lambda: str(uuid.uuid4()))
    messages: List[AguiMessage] = Field(default_factory=list)
    tools: List[Any] = Field(default_factory=list)
    context: List[Any] = Field(default_factory=list)
    state: Optional[Any] = None
    forwardedProps: Optional[Dict[str, Any]] = None


def _sse(event: Dict[str, Any]) -> str:
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def _message_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: List[str] = []
        for item in content:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                if item.get("type") == "text" and isinstance(item.get("text"), str):
                    parts.append(item["text"])
                elif isinstance(item.get("content"), str):
                    parts.append(item["content"])
        return "".join(parts)
    if isinstance(content, dict) and isinstance(content.get("text"), str):
        return content["text"]
    return str(content)


def _latest_user_text(messages: List[AguiMessage]) -> str:
    for msg in reversed(messages):
        if msg.role == "user":
            text = _message_text(msg.content).strip()
            if text:
                return text
    return ""


def _history_for_agent(messages: List[AguiMessage]) -> List[Dict[str, Any]]:
    """Convert prior AG-UI messages (excluding the latest user turn) to Hermes history."""
    if not messages:
        return []
    trimmed = list(messages)
    while trimmed and trimmed[-1].role == "user":
        trimmed.pop()
    history: List[Dict[str, Any]] = []
    for msg in trimmed:
        role = msg.role
        if role not in ("user", "assistant", "system", "tool"):
            continue
        text = _message_text(msg.content)
        entry: Dict[str, Any] = {"role": role, "content": text}
        if role == "tool" and msg.toolCallId:
            entry["tool_call_id"] = msg.toolCallId
        if role == "tool" and msg.name:
            entry["name"] = msg.name
        history.append(entry)
    return history


def _profile_from_input(input_data: RunAgentInput) -> Optional[str]:
    props = input_data.forwardedProps or {}
    if not isinstance(props, dict):
        return None
    for key in ("profile", "profileId", "profile_id"):
        raw = props.get(key)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()
    return None


def _a2ui_action_from_state(state: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(state, dict):
        return None
    action = state.get("a2uiAction")
    return action if isinstance(action, dict) else None


def _consolidate_a2ui_payloads(
    payloads: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Merge multiple a2ui.message payloads that share a surfaceId."""
    by_surface: Dict[str, Dict[str, Any]] = {}
    for raw in payloads:
        sid = raw.get("surfaceId") or raw.get("surface_id")
        if not isinstance(sid, str) or not sid.strip():
            continue
        sid = sid.strip()
        component = raw.get("component")
        if sid not in by_surface:
            entry: Dict[str, Any] = {
                "surfaceId": sid,
                "components": [],
                "complete": bool(raw.get("complete", True)),
            }
            data = raw.get("data")
            if isinstance(data, dict) and data:
                entry["data"] = data
            by_surface[sid] = entry
        entry = by_surface[sid]
        if isinstance(component, dict):
            comps = entry["components"]
            cid = component.get("id")
            replaced = False
            if isinstance(cid, str) and cid.strip():
                for idx, existing in enumerate(comps):
                    if existing.get("id") == cid:
                        comps[idx] = component
                        replaced = True
                        break
            if not replaced:
                comps.append(component)
        if raw.get("complete"):
            entry["complete"] = True
    return list(by_surface.values())


def _persist_a2ui(db: Any, session_id: str, a2ui_payload: Dict[str, Any]) -> None:
    """Attach A2UI JSON to the latest assistant message in the session."""
    try:
        rows = db.get_messages(session_id, limit=40)
    except Exception:
        return
    target_id = None
    existing_a2ui: Optional[Dict[str, Any]] = None
    for row in reversed(rows):
        if (row.get("role") or "").lower() == "assistant":
            target_id = row.get("id")
            raw = row.get("a2ui")
            if isinstance(raw, str) and raw.strip():
                try:
                    parsed = json.loads(raw)
                    existing_a2ui = parsed if isinstance(parsed, dict) else None
                except Exception:
                    existing_a2ui = None
            elif isinstance(raw, dict):
                existing_a2ui = raw
            break
    if target_id is None:
        return
    merged = a2ui_payload
    if existing_a2ui:
        merged_list = _consolidate_a2ui_payloads([existing_a2ui, a2ui_payload])
        if merged_list:
            merged = merged_list[0]
    try:
        encoded = json.dumps(merged, ensure_ascii=False)
    except Exception:
        return
    try:
        with db._lock:
            db._conn.execute(
                "UPDATE messages SET a2ui = ? WHERE id = ?",
                (encoded, target_id),
            )
            db._conn.commit()
    except Exception:
        _log.debug("Failed to persist a2ui on message %s", target_id, exc_info=True)


def _run_agent_sync(
    *,
    input_data: RunAgentInput,
    out_q: "queue.Queue[Optional[Dict[str, Any]]]",
    cancel: threading.Event,
) -> None:
    thread_id = input_data.threadId
    run_id = input_data.runId
    message_id = str(uuid.uuid4())
    user_text = _latest_user_text(input_data.messages)
    history = _history_for_agent(input_data.messages)
    profile = _profile_from_input(input_data)
    a2ui_action = _a2ui_action_from_state(input_data.state)

    def emit(event: Dict[str, Any]) -> None:
        if cancel.is_set():
            return
        out_q.put(event)

    emit({"type": "RUN_STARTED", "threadId": thread_id, "runId": run_id})

    # A2UI actionResponse follow-up: acknowledge without a full agent turn when
    # the user just submitted a form (create_cron / save / etc.).
    if a2ui_action and not user_text.startswith("A2UI actionResponse"):
        # Fall through to normal agent if somehow malformed.
        pass
    if a2ui_action and user_text.startswith("A2UI actionResponse"):
        action_name = str(a2ui_action.get("action") or "action")
        surface_id = str(a2ui_action.get("surfaceId") or "")
        emit(
            {
                "type": "TEXT_MESSAGE_START",
                "messageId": message_id,
                "role": "assistant",
            }
        )
        ack = f"Got it — `{action_name}`"
        if surface_id:
            ack += f" on surface `{surface_id}`"
        ack += " is done."
        emit(
            {
                "type": "TEXT_MESSAGE_CONTENT",
                "messageId": message_id,
                "delta": ack,
            }
        )
        emit({"type": "TEXT_MESSAGE_END", "messageId": message_id})
        emit(
            {
                "type": "RUN_FINISHED",
                "threadId": thread_id,
                "runId": run_id,
                "result": {"final_response": ack, "a2uiAction": a2ui_action},
            }
        )
        out_q.put(None)
        return

    if not user_text:
        emit(
            {
                "type": "RUN_ERROR",
                "threadId": thread_id,
                "runId": run_id,
                "message": "No user message in RunAgentInput",
                "code": "empty_input",
            }
        )
        out_q.put(None)
        return

    started_text = False
    started_thinking = False
    thinking_message_id = str(uuid.uuid4())
    open_tool_calls: Dict[str, str] = {}
    emitted_a2ui: List[Dict[str, Any]] = []

    def ensure_text_start() -> None:
        nonlocal started_text
        if not started_text:
            emit(
                {
                    "type": "TEXT_MESSAGE_START",
                    "messageId": message_id,
                    "role": "assistant",
                }
            )
            started_text = True

    def ensure_thinking_start() -> None:
        nonlocal started_thinking
        if not started_thinking:
            emit({"type": "THINKING_START"})
            emit(
                {
                    "type": "THINKING_TEXT_MESSAGE_START",
                    "messageId": thinking_message_id,
                    "role": "assistant",
                }
            )
            started_thinking = True

    def finish_thinking() -> None:
        nonlocal started_thinking
        if started_thinking:
            emit(
                {
                    "type": "THINKING_TEXT_MESSAGE_END",
                    "messageId": thinking_message_id,
                }
            )
            emit({"type": "THINKING_END"})
            started_thinking = False

    def on_stream_delta(delta: Optional[str]) -> None:
        if cancel.is_set():
            return
        if delta is None:
            return
        if not isinstance(delta, str) or not delta:
            return
        finish_thinking()
        ensure_text_start()
        emit(
            {
                "type": "TEXT_MESSAGE_CONTENT",
                "messageId": message_id,
                "delta": delta,
            }
        )

    def on_reasoning_delta(delta: Optional[str]) -> None:
        if cancel.is_set():
            return
        if not isinstance(delta, str) or not delta:
            return
        ensure_thinking_start()
        emit(
            {
                "type": "THINKING_TEXT_MESSAGE_CONTENT",
                "messageId": thinking_message_id,
                "delta": delta,
            }
        )

    def on_tool_start(tool_id: str, name: str, args: Any) -> None:
        if cancel.is_set():
            return
        finish_thinking()
        # Ensure an assistant message exists so the UI can attach A2UI surfaces.
        ensure_text_start()
        open_tool_calls[tool_id] = name
        emit(
            {
                "type": "TOOL_CALL_START",
                "toolCallId": tool_id,
                "toolCallName": name,
                "parentMessageId": message_id,
            }
        )
        try:
            args_json = args if isinstance(args, str) else json.dumps(args, ensure_ascii=False)
        except Exception:
            args_json = "{}"
        emit(
            {
                "type": "TOOL_CALL_ARGS",
                "toolCallId": tool_id,
                "delta": args_json,
            }
        )
        emit({"type": "TOOL_CALL_END", "toolCallId": tool_id})

    def on_tool_complete(tool_id: str, name: str, args: Any, result: Any) -> None:
        if cancel.is_set():
            return
        content = tool_result_content_for_client(result)
        emit(
            {
                "type": "TOOL_CALL_RESULT",
                "toolCallId": tool_id,
                "content": content,
                "messageId": str(uuid.uuid4()),
                "role": "tool",
            }
        )
        for a2ui_payload in extract_a2ui_messages(result):
            emit(
                {
                    "type": "CUSTOM",
                    "name": "a2ui.message",
                    "value": a2ui_payload,
                }
            )
            emitted_a2ui.append(a2ui_payload)
        open_tool_calls.pop(tool_id, None)

    # Marko platform gates frontend tools via check_fn.
    prev_platform = os.environ.get("HERMES_PLATFORM")
    os.environ["HERMES_PLATFORM"] = "marko"
    try:
        from hermes_cli.marko_session import ensure_marko_session, open_session_db
        from run_agent import AIAgent

        # Ensure marko tool module is imported (self-registers).
        try:
            import tools.a2ui_render_tool  # noqa: F401
        except Exception:
            _log.debug("Could not import a2ui_render_tool", exc_info=True)

        db = open_session_db(profile)
        try:
            ensure_marko_session(db, thread_id, source="marko")

            agent = AIAgent(
                session_id=thread_id,
                session_db=db,
                platform="marko",
                quiet_mode=True,
                ephemeral_system_prompt=(
                    "You are running inside the Marko chat UI (Hermes AG-UI). "
                    "When the user asks for a form, questionnaire, survey, contact form, "
                    "intake, or any interactive UI in chat, you MUST call the a2ui_render "
                    "tool with hermes:DynamicForm (title, description, fields array with "
                    "name/label/type/required/options, submitLabel). "
                    "Never paste HTML, CSS, or React form source code into the chat — "
                    "Marko cannot render raw HTML as a live form. "
                    "When the user asks for several form types at once (web/contact, survey, "
                    "document intake, app intake, etc.), says \"all of them\", \"each one\", "
                    "\"in parallel\", or lists multiple options, call a2ui_render ONCE with "
                    "a components array of hermes:DynamicForm entries — one per requested "
                    "form — and render ALL of them in that single tool call. Do not pick "
                    "only one form unless the user asked for one. Do not describe forms in "
                    "text instead of rendering them. "
                    "Use hermes:DocumentRequestForm for document/PPT requests and "
                    "hermes:CronSchedulePicker for schedules. Keep a short text reply "
                    "and let the interactive surfaces collect the input."
                ),
                stream_delta_callback=on_stream_delta,
                reasoning_callback=on_reasoning_delta,
                tool_start_callback=on_tool_start,
                tool_complete_callback=on_tool_complete,
            )

            if cancel.is_set():
                emit(
                    {
                        "type": "RUN_ERROR",
                        "threadId": thread_id,
                        "runId": run_id,
                        "message": "Cancelled",
                        "code": "cancelled",
                    }
                )
                return

            result = agent.run_conversation(
                user_text,
                conversation_history=history or None,
            )

            if cancel.is_set():
                emit(
                    {
                        "type": "RUN_ERROR",
                        "threadId": thread_id,
                        "runId": run_id,
                        "message": "Cancelled",
                        "code": "cancelled",
                    }
                )
                return

            finish_thinking()

            final = (result or {}).get("final_response") or ""
            if final and not started_text:
                ensure_text_start()
                emit(
                    {
                        "type": "TEXT_MESSAGE_CONTENT",
                        "messageId": message_id,
                        "delta": final,
                    }
                )

            if started_text:
                emit({"type": "TEXT_MESSAGE_END", "messageId": message_id})

            for payload in _consolidate_a2ui_payloads(emitted_a2ui):
                _persist_a2ui(db, thread_id, payload)

            # Auto-summarize session title after early replies.
            # Fast path: heuristic immediately so hermes.title always rides this
            # SSE stream (LLM title_generation often fails / stalls with no keys).
            reply_for_title = final or ("…" if started_text else "")
            if user_text and reply_for_title and not cancel.is_set():
                try:
                    from agent.title_generator import (
                        auto_title_session,
                        heuristic_title,
                        is_placeholder_title,
                    )

                    prior_users = sum(
                        1 for m in (history or []) if isinstance(m, dict) and m.get("role") == "user"
                    )
                    # First or second user turn (current message not yet in history).
                    early_turn = prior_users <= 1
                    existing_title = None
                    try:
                        existing_title = db.get_session_title(thread_id)
                    except Exception:
                        existing_title = None
                    needs_title = early_turn and (
                        not existing_title or is_placeholder_title(existing_title)
                    )

                    if needs_title:
                        quick = heuristic_title(user_text)
                        if quick:
                            try:
                                db.set_session_title(thread_id, quick)
                            except Exception:
                                _log.warning(
                                    "Marko heuristic title persist failed for %s",
                                    thread_id,
                                    exc_info=True,
                                )
                            emit(
                                {
                                    "type": "CUSTOM",
                                    "name": "hermes.title",
                                    "value": {
                                        "title": quick,
                                        "sessionId": thread_id,
                                    },
                                }
                            )

                        # Optional LLM upgrade in background (own DB handle —
                        # this request's db is closed in finally).
                        def _llm_title_upgrade() -> None:
                            try:
                                from hermes_cli.marko_session import open_session_db

                                upgrade_db = open_session_db(profile)
                                try:
                                    auto_title_session(
                                        upgrade_db,
                                        thread_id,
                                        user_text,
                                        final or quick or user_text,
                                    )
                                finally:
                                    try:
                                        upgrade_db.close()
                                    except Exception:
                                        pass
                            except Exception:
                                _log.debug("Marko LLM title upgrade skipped", exc_info=True)

                        threading.Thread(
                            target=_llm_title_upgrade,
                            daemon=True,
                            name="marko-auto-title-upgrade",
                        ).start()
                except Exception:
                    _log.debug("Marko auto-title skipped", exc_info=True)

            # Context usage for the Marko token ring (StatusFooter).
            try:
                compressor = getattr(agent, "context_compressor", None)
                if compressor is not None:
                    used = int(
                        getattr(compressor, "last_prompt_tokens", 0)
                        or getattr(compressor, "prompt_tokens", 0)
                        or 0
                    )
                    limit = int(
                        getattr(compressor, "context_length", 0)
                        or getattr(compressor, "max_context_tokens", 0)
                        or 0
                    )
                    if used or limit:
                        emit(
                            {
                                "type": "CUSTOM",
                                "name": "hermes.context",
                                "value": {
                                    "tokensUsed": used,
                                    "tokensMax": limit or None,
                                    "sessionId": thread_id,
                                },
                            }
                        )
            except Exception:
                _log.debug("Marko hermes.context emit skipped", exc_info=True)

            emit(
                {
                    "type": "RUN_FINISHED",
                    "threadId": thread_id,
                    "runId": run_id,
                    "result": {
                        "final_response": final,
                        "a2uiSurfaces": [p.get("surfaceId") for p in emitted_a2ui],
                    }
                    if final or emitted_a2ui
                    else None,
                }
            )
        finally:
            try:
                db.close()
            except Exception:
                pass
    except Exception as exc:
        _log.exception("AG-UI run failed")
        finish_thinking()
        if started_text:
            emit({"type": "TEXT_MESSAGE_END", "messageId": message_id})
        emit(
            {
                "type": "RUN_ERROR",
                "threadId": thread_id,
                "runId": run_id,
                "message": str(exc) or "Agent run failed",
                "code": "agent_error",
            }
        )
    finally:
        if prev_platform is None:
            os.environ.pop("HERMES_PLATFORM", None)
        else:
            os.environ["HERMES_PLATFORM"] = prev_platform
        out_q.put(None)


async def _event_stream(
    request: Request,
    input_data: RunAgentInput,
) -> AsyncIterator[str]:
    out_q: queue.Queue[Optional[Dict[str, Any]]] = queue.Queue()
    cancel = threading.Event()

    worker = threading.Thread(
        target=_run_agent_sync,
        kwargs={"input_data": input_data, "out_q": out_q, "cancel": cancel},
        name=f"agui-{input_data.runId[:8]}",
        daemon=True,
    )
    worker.start()

    try:
        while True:
            if await request.is_disconnected():
                cancel.set()
            try:
                event = await asyncio.to_thread(out_q.get, True, 0.25)
            except queue.Empty:
                if cancel.is_set() and not worker.is_alive():
                    break
                continue
            if event is None:
                break
            yield _sse(event)
    finally:
        cancel.set()
        try:
            await asyncio.to_thread(worker.join, 2.0)
        except Exception:
            pass


@router.post("/agui")
async def agui_run(request: Request, body: RunAgentInput):
    """AG-UI agent run — SSE event stream, in-process Hermes agent."""
    return StreamingResponse(
        _event_stream(request, body),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
