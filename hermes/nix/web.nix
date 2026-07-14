# nix/web.nix — placeholder web_dist for Hermes packaging.
#
# The upstream Vite React dashboard (``web/``) was removed from this fork.
# Agent-Marko Next.js UI is built from the parent monorepo via
# ``npm run build:ui`` into ``hermes_cli/web_dist``. Nix packaging ships a
# minimal placeholder so the wrapped binary still has a HERMES_WEB_DIST path.
{ pkgs, hermesNpmLib, ... }:
pkgs.runCommand "hermes-web-dist" { } ''
  mkdir -p $out
  cat > $out/index.html <<'EOF'
  <!doctype html>
  <html lang="en">
    <head><meta charset="utf-8"><title>Hermes</title></head>
    <body>
      <p>Marko UI is not built by Nix. From the monorepo root run:
      <code>npm install &amp;&amp; npm run build:ui</code></p>
    </body>
  </html>
  EOF
''
