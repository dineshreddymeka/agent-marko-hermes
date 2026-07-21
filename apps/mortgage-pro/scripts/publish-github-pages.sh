#!/usr/bin/env bash
# Push redesign to main and ensure GitHub Pages (Actions) is enabled.
# Requires write access to dineshreddymeka/mortgage-pro (e.g. your user PAT / gh auth).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

REPO="${REPO:-dineshreddymeka/mortgage-pro}"
BRANCH="${BRANCH:-cursor/redesign-property-pro-ui-215d}"
LIVE_URL="https://dineshreddymeka.github.io/mortgage-pro/"

echo "[pages] Repo: $REPO"
echo "[pages] Branch: $BRANCH"

if ! command -v gh >/dev/null 2>&1; then
  echo "[pages] gh CLI is required." >&2
  exit 1
fi

echo "[pages] Pushing $BRANCH…"
git push -u origin "$BRANCH"

echo "[pages] Merging $BRANCH → main…"
gh api -X POST "repos/${REPO}/merges" \
  -f base=main \
  -f head="$BRANCH" \
  -f commit_message="Merge ${BRANCH}: Property Pro redesign for GitHub Pages" \
  >/dev/null

echo "[pages] Enabling GitHub Pages (workflow build)…"
if gh api "repos/${REPO}/pages" >/dev/null 2>&1; then
  gh api -X PUT "repos/${REPO}/pages" \
    -f build_type=workflow >/dev/null || true
else
  gh api -X POST "repos/${REPO}/pages" \
    -f build_type=workflow >/dev/null || true
fi

echo "[pages] Dispatching Deploy to GitHub Pages…"
gh workflow run "Deploy to GitHub Pages" --repo "$REPO" --ref main || true

echo "[pages] Waiting for latest workflow run…"
for i in $(seq 1 60); do
  run_json="$(gh run list --repo "$REPO" --workflow "Deploy to GitHub Pages" --limit 1 --json databaseId,status,conclusion,url 2>/dev/null || true)"
  status="$(echo "$run_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['status'] if d else '')" 2>/dev/null || true)"
  conclusion="$(echo "$run_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0].get('conclusion') or '' if d else '')" 2>/dev/null || true)"
  url="$(echo "$run_json" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['url'] if d else '')" 2>/dev/null || true)"
  echo "[pages] run status=$status conclusion=$conclusion"
  if [[ "$status" == "completed" ]]; then
    if [[ "$conclusion" == "success" ]]; then
      echo "[pages] Deploy succeeded."
      echo "[pages] Live: $LIVE_URL"
      echo "[pages] Run: $url"
      exit 0
    fi
    echo "[pages] Deploy finished with conclusion=$conclusion" >&2
    echo "[pages] Run: $url" >&2
    exit 1
  fi
  sleep 5
done

echo "[pages] Timed out waiting for workflow. Check Actions: https://github.com/${REPO}/actions" >&2
exit 1
