#!/usr/bin/env bash
# Alias: one-hop Hermes UI (no Next proxy, no tunnel).
exec "$(cd "$(dirname "$0")" && pwd)/start-hermes-ui.sh" "$@"
