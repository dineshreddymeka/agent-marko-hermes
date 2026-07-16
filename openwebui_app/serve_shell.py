#!/usr/bin/env python3
"""Serve Hermes left-rail shell that embeds Open WebUI + Hermes panel actions."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, FileResponse
import uvicorn

ROOT = Path(__file__).resolve().parent
INDEX = ROOT / "index.html"

app = FastAPI(title="Hermes Open WebUI Shell")


@app.get("/", response_class=HTMLResponse)
def home() -> HTMLResponse:
    html = INDEX.read_text(encoding="utf-8")
    owui = os.environ.get("OPENWEBUI_PUBLIC_URL") or os.environ.get("OWUI_URL") or "http://127.0.0.1:3000"
    hermes = os.environ.get("HERMES_PUBLIC_URL") or os.environ.get("HERMES_URL") or "http://127.0.0.1:9119"
    # Inject defaults for same-origin / tunnel cases
    inject = (
        f"<script>window.__OWUI_URL__={owui!r};window.__HERMES_URL__={hermes!r};</script>"
    )
    html = html.replace("</head>", inject + "</head>", 1)
    return HTMLResponse(html)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "shell": "hermes-openwebui"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.environ.get("SHELL_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("SHELL_PORT", "3200")))
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
