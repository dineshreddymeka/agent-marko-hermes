"""Marko Profile DTO bridge over Hermes CLI profiles.

Maps Hermes ``ProfileInfo`` + ``SOUL.md`` + ``profile.yaml`` ``marko`` metadata
to the Open Jarvis / Agent-Marko ``Profile`` shape consumed by the UI.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from hermes_cli import profiles as profiles_mod

_MARKO_PROVIDERS = frozenset({"native", "agui-remote", "hermes-python"})
_DEFAULT_TEMPERATURE = 0.7
_DEFAULT_PROVIDER = "hermes-python"
_DEFAULT_MODEL = "composer-2.5"


def _slug_profile_id(name: str) -> str:
    """Turn a user-facing label into a valid Hermes profile id."""
    stripped = (name or "").strip()
    if not stripped:
        raise ValueError("profile name cannot be empty")
    if stripped.casefold() == "default":
        return "default"

    lowered = stripped.lower()
    if profiles_mod._PROFILE_ID_RE.match(lowered):
        profiles_mod.validate_profile_name(lowered)
        return lowered

    slug = re.sub(r"[^a-z0-9_-]+", "-", lowered).strip("-_")
    if not slug:
        slug = re.sub(r"[^a-z0-9]+", "", lowered)[:64]
    if not slug:
        raise ValueError("profile name cannot be empty")
    if slug[0].isdigit():
        slug = f"p-{slug}"
    profiles_mod.validate_profile_name(slug)
    return slug


def _read_profile_yaml(profile_dir: Path) -> dict:
    path = profiles_mod._profile_yaml_path(profile_dir)
    if not path.is_file():
        return {}
    try:
        import yaml

        with open(path, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _write_profile_yaml(profile_dir: Path, data: dict) -> None:
    import yaml

    path = profiles_mod._profile_yaml_path(profile_dir)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        yaml.safe_dump(data, f, sort_keys=False, default_flow_style=False)


def _read_marko_meta(profile_dir: Path) -> dict:
    marko = _read_profile_yaml(profile_dir).get("marko")
    return marko if isinstance(marko, dict) else {}


def _update_marko_meta(profile_dir: Path, **updates: Any) -> dict:
    data = _read_profile_yaml(profile_dir)
    marko = data.get("marko")
    if not isinstance(marko, dict):
        marko = {}
    for key, value in updates.items():
        if value is not None:
            marko[key] = value
    data["marko"] = marko
    _write_profile_yaml(profile_dir, data)
    return marko


def _read_soul(profile_dir: Path) -> str:
    soul_path = profile_dir / "SOUL.md"
    if not soul_path.is_file():
        return ""
    try:
        return soul_path.read_text(encoding="utf-8")
    except OSError:
        return ""


def _write_soul(profile_dir: Path, content: str) -> None:
    profile_dir.mkdir(parents=True, exist_ok=True)
    (profile_dir / "SOUL.md").write_text(content or "", encoding="utf-8")


def _normalize_marko_provider(value: Any) -> str:
    provider = str(value or _DEFAULT_PROVIDER).strip()
    if provider not in _MARKO_PROVIDERS:
        return _DEFAULT_PROVIDER
    return provider


def _write_model_config(profile_dir: Path, model: str) -> None:
    model = (model or "").strip()
    if not model:
        return
    from hermes_constants import reset_hermes_home_override, set_hermes_home_override
    from hermes_cli.config import load_config, save_config

    token = set_hermes_home_override(str(profile_dir))
    try:
        cfg = load_config()
        model_cfg = cfg.get("model", {})
        if isinstance(model_cfg, str):
            model_cfg = {"default": model_cfg}
        if not isinstance(model_cfg, dict):
            model_cfg = {}
        model_cfg["default"] = model
        cfg["model"] = model_cfg
        save_config(cfg)
    finally:
        reset_hermes_home_override(token)


def _profile_info_to_marko(info: profiles_mod.ProfileInfo) -> Dict[str, Any]:
    marko = _read_marko_meta(info.path)
    display_name = marko.get("displayName") or marko.get("name")
    if not display_name:
        display_name = "Default" if info.name == "default" else info.name
    temperature = marko.get("temperature", _DEFAULT_TEMPERATURE)
    try:
        temperature = float(temperature)
    except (TypeError, ValueError):
        temperature = _DEFAULT_TEMPERATURE
    settings = marko.get("settings")
    if not isinstance(settings, dict):
        settings = {}
    settings = {
        **settings,
        "skillCount": info.skill_count,
        "isDefault": info.is_default,
        "gatewayRunning": info.gateway_running,
        "hasEnv": info.has_env,
    }
    provider_config = marko.get("providerConfig")
    if info.provider and not isinstance(provider_config, dict):
        provider_config = {"hermesProvider": info.provider}
    elif isinstance(provider_config, dict) and info.provider:
        provider_config = {**provider_config, "hermesProvider": info.provider}
    return {
        "id": info.name,
        "name": str(display_name),
        "systemPrompt": _read_soul(info.path),
        "model": info.model or marko.get("model") or _DEFAULT_MODEL,
        "temperature": temperature,
        "provider": _normalize_marko_provider(marko.get("provider")),
        "providerConfig": provider_config if isinstance(provider_config, dict) else None,
        "settings": settings,
    }


def _find_profile_info(name: str) -> profiles_mod.ProfileInfo:
    canon = profiles_mod.normalize_profile_name(name)
    for info in profiles_mod.list_profiles():
        if info.name == canon:
            return info
    raise FileNotFoundError(f"Profile '{canon}' does not exist.")


def list_marko_profiles() -> List[Dict[str, Any]]:
    return [_profile_info_to_marko(info) for info in profiles_mod.list_profiles()]


def get_marko_default_profile_id() -> str:
    return profiles_mod.get_active_profile() or "default"


def set_marko_default_profile(name: str) -> str:
    profiles_mod.set_active_profile(name)
    return get_marko_default_profile_id()


def create_marko_profile(data: Dict[str, Any]) -> Dict[str, Any]:
    raw_name = str(data.get("name") or "").strip()
    if not raw_name:
        raise ValueError("profile name is required")
    profile_id = _slug_profile_id(raw_name)
    if profile_id == "default":
        raise ValueError("Cannot create a profile named 'default'.")

    system_prompt = str(data.get("systemPrompt") or "")
    model = str(data.get("model") or _DEFAULT_MODEL).strip() or _DEFAULT_MODEL
    temperature = data.get("temperature", _DEFAULT_TEMPERATURE)
    provider = _normalize_marko_provider(data.get("provider"))
    provider_config = data.get("providerConfig")
    settings = data.get("settings")

    profile_dir = profiles_mod.create_profile(profile_id, no_skills=True)
    _write_soul(profile_dir, system_prompt)
    _write_model_config(profile_dir, model)
    _update_marko_meta(
        profile_dir,
        displayName=raw_name,
        model=model,
        temperature=temperature,
        provider=provider,
        providerConfig=provider_config if isinstance(provider_config, dict) else None,
        settings=settings if isinstance(settings, dict) else None,
    )

    collision = profiles_mod.check_alias_collision(profile_id)
    if not collision:
        profiles_mod.create_wrapper_script(profile_id)

    return _profile_info_to_marko(_find_profile_info(profile_id))


def update_marko_profile(name: str, data: Dict[str, Any]) -> Dict[str, Any]:
    info = _find_profile_info(name)
    profile_dir = info.path
    target_id = info.name

    new_name = data.get("name")
    if isinstance(new_name, str) and new_name.strip():
        new_id = _slug_profile_id(new_name)
        if new_id != info.name:
            profile_dir = profiles_mod.rename_profile(info.name, new_id)
            target_id = new_id
            _update_marko_meta(profile_dir, displayName=new_name.strip())
        else:
            _update_marko_meta(profile_dir, displayName=new_name.strip())

    if "systemPrompt" in data:
        _write_soul(profile_dir, str(data.get("systemPrompt") or ""))

    if "model" in data and data.get("model") is not None:
        model = str(data.get("model") or "").strip()
        if model:
            _write_model_config(profile_dir, model)
            _update_marko_meta(profile_dir, model=model)

    marko_updates: Dict[str, Any] = {}
    if "temperature" in data and data.get("temperature") is not None:
        marko_updates["temperature"] = data.get("temperature")
    if "provider" in data and data.get("provider") is not None:
        marko_updates["provider"] = _normalize_marko_provider(data.get("provider"))
    if "providerConfig" in data:
        cfg = data.get("providerConfig")
        marko_updates["providerConfig"] = cfg if isinstance(cfg, dict) else None
    if "settings" in data:
        settings = data.get("settings")
        marko_updates["settings"] = settings if isinstance(settings, dict) else None
    if marko_updates:
        _update_marko_meta(profile_dir, **marko_updates)

    return _profile_info_to_marko(_find_profile_info(target_id))
