/**
 * Dev helper: Hermes + Marko UI (Next static export / next dev).
 * Hermes must be started separately so the UI proxies to :9119.
 */
console.log(`
Agent-Marko ↔ Hermes (direct)

1) Hermes backend (from hermes/):
   cd hermes
   PYTHONPATH=. python -m hermes_cli.main dashboard --no-open --skip-build
   # listens on http://127.0.0.1:9119

2) Marko UI (Next → proxies /api and /agui to :9119):
   npm install
   npm run dev:ui
   # open http://127.0.0.1:5173

Prod: npm run build:ui  →  hermes/hermes_cli/web_dist
Then: python -m hermes_cli.main dashboard --skip-build — Marko SPA is served same-origin.
`)
