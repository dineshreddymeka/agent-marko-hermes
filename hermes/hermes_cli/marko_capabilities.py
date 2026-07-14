"""Marko capabilities manifest derived from Hermes OpenAPI + live registries.

Next.js talks one-hop to Hermes. This endpoint lets the UI discover which
surfaces are actually available from the live Swagger/OpenAPI surface, so
panels can degrade gracefully when a route family is missing.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter(tags=["marko-capabilities"])

# Feature → OpenAPI path prefixes that unlock it for Marko.
_FEATURE_PATH_PREFIXES: Dict[str, tuple[str, ...]] = {
    "agui": ("/agui",),
    "sessions": ("/api/sessions",),
    "profiles": ("/api/profiles",),
    "skills": ("/api/skills",),
    "memory": ("/api/memory",),
    "mcp": ("/api/mcp",),
    "cron": ("/api/cron",),
    "kanban": ("/api/kanban",),
    "workspace": ("/api/fs", "/api/workspace"),
    "search": ("/api/search",),
    "approval": ("/api/approval",),
    "cowork": ("/api/cowork",),
    "office": ("/api/office",),
    "debug": ("/api/debug",),
    "a2ui": ("/agui", "/api/cron", "/api/workspace", "/api/fs", "/api/memory"),
}


def _openapi_paths(request: Request) -> Set[str]:
    try:
        schema = request.app.openapi()
    except Exception:
        return set()
    paths = schema.get("paths") or {}
    return set(paths.keys()) if isinstance(paths, dict) else set()


def _feature_flags(paths: Set[str]) -> Dict[str, bool]:
    flags: Dict[str, bool] = {}
    for feature, prefixes in _FEATURE_PATH_PREFIXES.items():
        flags[feature] = any(
            any(p == prefix or p.startswith(prefix + "/") for p in paths)
            for prefix in prefixes
        )
    # A2UI is available when AG-UI is mounted (surfaces stream over /agui).
    flags["a2ui"] = bool(flags.get("agui"))
    return flags


def _list_skill_entries() -> List[Dict[str, Any]]:
    entries: List[Dict[str, Any]] = []
    try:
        from tools.skills_tool import skills_list  # type: ignore

        raw = skills_list()
        if isinstance(raw, str):
            import json

            try:
                raw = json.loads(raw)
            except Exception:
                raw = []
        rows = raw if isinstance(raw, list) else []
        for item in rows[:200]:
            if not isinstance(item, dict):
                continue
            name = str(item.get("name") or item.get("skill") or "").strip()
            if not name:
                continue
            entries.append(
                {
                    "id": str(item.get("id") or name),
                    "name": name,
                    "description": str(item.get("description") or ""),
                    "triggers": item.get("triggers") if isinstance(item.get("triggers"), list) else None,
                    "source": str(item.get("source") or "hermes"),
                }
            )
    except Exception:
        pass
    return entries


def _list_mcp_plugins() -> List[Dict[str, Any]]:
    plugins: List[Dict[str, Any]] = []
    try:
        # Prefer dashboard helper if present; otherwise read config MCP block.
        try:
            from hermes_cli import config as hermes_config

            cfg = hermes_config.load_config() or {}
        except Exception:
            cfg = {}
        mcp = cfg.get("mcp") if isinstance(cfg, dict) else None
        servers = []
        if isinstance(mcp, dict):
            servers = mcp.get("servers") or mcp.get("mcpServers") or []
            if isinstance(servers, dict):
                servers = [
                    {"name": k, **(v if isinstance(v, dict) else {})}
                    for k, v in servers.items()
                ]
        if not isinstance(servers, list):
            servers = []
        for row in servers:
            if not isinstance(row, dict):
                continue
            name = str(row.get("name") or row.get("id") or "").strip()
            if not name:
                continue
            enabled = row.get("enabled", True)
            plugins.append(
                {
                    "id": name,
                    "kind": "mcp",
                    "name": name,
                    "status": "ready" if enabled else "disabled",
                    "toolCount": 0,
                    "trusted": True,
                }
            )
    except Exception:
        pass
    return plugins


def _slash_commands_from_mcp(plugins: List[Dict[str, Any]]) -> List[Dict[str, str]]:
    commands: List[Dict[str, str]] = []
    for plugin in plugins:
        name = plugin.get("name") or plugin.get("id")
        if not name:
            continue
        commands.append(
            {
                "name": f"mcp:{name}",
                "server": str(name),
                "description": f"MCP server {name}",
            }
        )
    return commands


def _agent_llm_snapshot() -> Dict[str, Any]:
    mock = str((__import__("os").environ.get("HERMES_MOCK_LLM") or "")).strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    degraded = False
    last_ok = True
    last_failure = None
    try:
        # Lightweight probe: prefer configured model presence over a live call.
        from hermes_cli.config import load_config

        cfg = load_config() or {}
        model = (cfg.get("model") or {}).get("default") if isinstance(cfg.get("model"), dict) else cfg.get("model")
        if not model and not mock:
            degraded = True
            last_ok = False
            last_failure = "No default model configured"
    except Exception as exc:
        degraded = True
        last_ok = False
        last_failure = str(exc)
    return {
        "preferredAgentBaseUrl": None,
        "bridgeFallbackBaseUrl": "",
        "circuitState": "open" if degraded else "closed",
        "consecutiveFailures": 1 if degraded else 0,
        "lastFailure": last_failure,
        "lastSuccessAt": None if degraded else datetime.now(timezone.utc).isoformat(),
        "lastHealthCheckAt": datetime.now(timezone.utc).isoformat(),
        "lastHealthOk": last_ok,
        "routing": "capabilities",
        "timeoutMs": 30_000,
        "degraded": degraded or mock,
        "toolsEnabled": not degraded,
    }


def build_capabilities_manifest(request: Request) -> Dict[str, Any]:
    paths = _openapi_paths(request)
    features = _feature_flags(paths)
    skills = _list_skill_entries() if features.get("skills") else []
    plugins = _list_mcp_plugins() if features.get("mcp") else []
    slash = _slash_commands_from_mcp(plugins)
    agent_llm = _agent_llm_snapshot()
    now = datetime.now(timezone.utc).isoformat()

    tools: List[Dict[str, Any]] = []
    if features.get("agui"):
        tools.append(
            {
                "name": "agui_chat",
                "source": "native",
                "dangerous": False,
                "description": "In-process POST /agui SSE agent runs",
                "trusted": True,
            }
        )
    if features.get("a2ui"):
        tools.append(
            {
                "name": "a2ui_render",
                "source": "native",
                "dangerous": False,
                "description": "Interactive A2UI surfaces over CUSTOM a2ui.message",
                "trusted": True,
            }
        )

    providers = [
        {
            "id": "hermes-python",
            "label": "Hermes (in-process)",
            "available": True,
            "status": "available",
            "reason": None,
            "delegatable": False,
        },
        {
            "id": "native",
            "label": "Native",
            "available": False,
            "status": "unavailable",
            "reason": "Not used in Hermes-direct Marko build",
            "delegatable": False,
        },
        {
            "id": "agui-remote",
            "label": "Remote AG-UI",
            "available": False,
            "status": "unavailable",
            "reason": "Marko uses in-process /agui",
            "delegatable": False,
        },
    ]

    return {
        "tools": tools,
        "skills": skills,
        "plugins": plugins,
        "slashCommands": slash,
        "providers": providers,
        "refreshedAt": now,
        "retrievalMode": "lexical",
        "routing": "capabilities",
        "agentLlm": agent_llm,
        # Marko extensions — OpenAPI-driven flexibility map
        "features": features,
        "openapi": {
            "docsUrl": "/docs",
            "schemaUrl": "/openapi.json",
            "pathCount": len(paths),
            "backend": "hermes",
            "direct": True,
        },
    }


@router.get("/api/capabilities")
async def get_capabilities(request: Request):
    """Capability manifest for Marko — derived from live Hermes OpenAPI."""
    return JSONResponse(build_capabilities_manifest(request))


@router.post("/api/capabilities")
@router.post("/api/capabilities/warm")
async def warm_capabilities(request: Request):
    """Rebuild manifest (optional MCP reconnect is best-effort)."""
    mcp_error: Optional[str] = None
    try:
        from hermes_cli import config as hermes_config

        hermes_config.load_config()
    except Exception as exc:
        mcp_error = str(exc)

    manifest = build_capabilities_manifest(request)
    return {
        "ok": True,
        "refreshedAt": manifest["refreshedAt"],
        "tools": len(manifest["tools"]),
        "skills": len(manifest["skills"]),
        "plugins": len(manifest["plugins"]),
        "slashCommands": len(manifest["slashCommands"]),
        "providers": len(manifest["providers"]),
        "agentLlm": manifest["agentLlm"],
        "features": manifest["features"],
        "openapi": manifest["openapi"],
        "mcpReconnect": {
            "ok": mcp_error is None,
            "error": mcp_error,
        },
    }
