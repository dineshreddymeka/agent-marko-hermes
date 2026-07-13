"""In-process AG-UI SSE endpoint for Agent-Marko UI.

Browser → Hermes FastAPI only (no Bun middle layer). Streams AG-UI events
while driving ``AIAgent.run_conversation`` with ``stream_callback``.
"""

from __future__ import annotations

import asyncio
import json
import logging
import queue
import threading
import uuid
from typing import Any, AsyncIterator, Dict, List, Optional

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

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
    # Drop trailing user message — run_conversation adds it.
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

    def emit(event: Dict[str, Any]) -> None:
        if cancel.is_set():
            return
        out_q.put(event)

    emit({"type": "RUN_STARTED", "threadId": thread_id, "runId": run_id})

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
    open_tool_calls: Dict[str, str] = {}

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

    def on_stream_delta(delta: Optional[str]) -> None:
        if cancel.is_set():
            return
        if delta is None:
            return
        if not isinstance(delta, str) or not delta:
            return
        ensure_text_start()
        emit(
            {
                "type": "TEXT_MESSAGE_CONTENT",
                "messageId": message_id,
                "delta": delta,
            }
        )

    def on_tool_start(tool_id: str, name: str, args: Any) -> None:
        if cancel.is_set():
            return
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
        try:
            if isinstance(result, str):
                content = result
            else:
                content = json.dumps(result, ensure_ascii=False, default=str)
        except Exception:
            content = str(result)
        emit(
            {
                "type": "TOOL_CALL_RESULT",
                "toolCallId": tool_id,
                "content": content,
                "messageId": str(uuid.uuid4()),
                "role": "tool",
            }
        )
        open_tool_calls.pop(tool_id, None)

    try:
        from hermes_cli.marko_session import ensure_marko_session, open_session_db
        from run_agent import AIAgent

        db = open_session_db(profile)
        try:
            ensure_marko_session(db, thread_id, source="marko")

            agent = AIAgent(
                session_id=thread_id,
                session_db=db,
                platform="marko",
                quiet_mode=True,
                stream_delta_callback=on_stream_delta,
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
                # Streaming already wired via AIAgent(stream_delta_callback=...).
                # Do not also pass stream_callback — that double-emits deltas.
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

            emit(
                {
                    "type": "RUN_FINISHED",
                    "threadId": thread_id,
                    "runId": run_id,
                    "result": {"final_response": final} if final else None,
                }
            )
        finally:
            try:
                db.close()
            except Exception:
                pass
    except Exception as exc:
        _log.exception("AG-UI run failed")
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
        # Drain briefly so the worker can exit cleanly.
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
