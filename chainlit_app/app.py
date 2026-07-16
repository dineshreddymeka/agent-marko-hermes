"""Chainlit chat UI → Hermes OpenAI-compatible proxy.

Env (set by scripts/start-chainlit-hermes.sh):
  HERMES_PROXY_URL   base including /v1, e.g. http://127.0.0.1:8645/v1
  OPENAI_API_KEY     any non-empty bearer (proxy attaches real OAuth creds)
  HERMES_PROXY_MODEL optional model id override
"""

from __future__ import annotations

import os
from typing import List

import chainlit as cl
from openai import AsyncOpenAI

DEFAULT_BASE = "http://127.0.0.1:8645/v1"
DEFAULT_KEY = "hermes-proxy"
DEFAULT_MODEL = "default"


def _client() -> AsyncOpenAI:
    base = (os.environ.get("HERMES_PROXY_URL") or os.environ.get("OPENAI_API_BASE") or DEFAULT_BASE).rstrip("/")
    if not base.endswith("/v1"):
        base = f"{base}/v1"
    key = os.environ.get("OPENAI_API_KEY") or DEFAULT_KEY
    return AsyncOpenAI(base_url=base, api_key=key)


def _model() -> str:
    return (
        os.environ.get("HERMES_PROXY_MODEL")
        or os.environ.get("OPENAI_MODEL")
        or DEFAULT_MODEL
    )


@cl.on_chat_start
async def on_chat_start() -> None:
    cl.user_session.set("messages", [])
    base = os.environ.get("HERMES_PROXY_URL") or DEFAULT_BASE
    await cl.Message(
        content=(
            f"**Hermes proxy:** `{base}`\n\n"
            "Send a message. Hermes attaches your OAuth provider credentials "
            "(`hermes proxy start`). If the proxy is down or you are not logged in, "
            "you will see an error — run `hermes auth` / `hermes proxy status`."
        )
    ).send()


@cl.on_message
async def on_message(message: cl.Message) -> None:
    history: List[dict] = cl.user_session.get("messages") or []
    history.append({"role": "user", "content": message.content})

    reply = cl.Message(content="")
    await reply.send()

    try:
        stream = await _client().chat.completions.create(
            model=_model(),
            messages=history,
            stream=True,
        )
        full = ""
        async for chunk in stream:
            delta = ""
            if chunk.choices:
                delta = chunk.choices[0].delta.content or ""
            if delta:
                full += delta
                await reply.stream_token(delta)
        if not full:
            full = "(empty response from Hermes proxy)"
            reply.content = full
            await reply.update()
        history.append({"role": "assistant", "content": full})
        cl.user_session.set("messages", history)
    except Exception as exc:  # noqa: BLE001 — surface to chat
        reply.content = (
            f"**Proxy error:** `{type(exc).__name__}: {exc}`\n\n"
            "Check that `hermes proxy start` is running and "
            "`hermes proxy status` shows a logged-in provider."
        )
        await reply.update()
