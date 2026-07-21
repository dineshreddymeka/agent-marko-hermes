# Property Pro

A **single-page web app** for modeling **mortgages**, **rental cash flow**, and **when-to-sell** scenarios. Built with **React**, **TypeScript**, **Vite**, and **Material UI** (Material Design). State stays in the browser (local storage); you can **Export Excel** for an offline workbook.

## Features

- **Mortgage** — Loan inputs, amortization-style views, paydown visualization, and related calculations.
- **Rental** — Rental income and expense modeling (including composition breakdown).
- **When to sell** — Scenario math to compare holding vs. selling.
- **Persistence** — Scenarios are saved automatically in `localStorage`.
- **Export Excel** — Download a multi-sheet workbook (inputs, formulas, projections) from the toolbar.
- **Theme** — Light and dark mode.

## Requirements

- **Node.js** 18+ (the GitHub Actions workflow uses Node 22).
- **npm** (comes with Node).

## Quick start

```bash
git clone git@github.com:hema986/mortgage-pro.git
cd mortgage-pro
npm install
npm run dev
```

Open the URL Vite prints (default: [http://127.0.0.1:5173](http://127.0.0.1:5173)).

### Background dev server (optional)

Scripts install npm dependencies when needed, start Vite in the background, and write logs to `.dev-server.log` (see `.gitignore`).

```bash
./scripts/dev-start.sh # or: npm run dev:start
./scripts/dev-stop.sh     # or: npm run dev:stop
```

Override port or host if needed:

```bash
PORT=3000 HOST=0.0.0.0 ./scripts/dev-start.sh
```

## Build

```bash
npm run build
```

Output is in `dist/`. For a local production preview:

```bash
npm run preview
```

## GitHub Pages (live site)

The workflow [Deploy to GitHub Pages](.github/workflows/deploy-pages.yml) builds the app with `npm ci && npm run build` and publishes the `dist/` folder whenever you push to `main` (or when you run the workflow manually).

**Live URL (after setup):** [https://hema986.github.io/mortgage-pro/](https://hema986.github.io/mortgage-pro/)

### First-time setup on GitHub

You only need to do this once per repository:

1. Open **[repo Settings → Pages](https://github.com/hema986/mortgage-pro/settings/pages)**.
2. Under **Build and deployment → Source**, choose **GitHub Actions** (not “Deploy from a branch”).
3. Open the **[Actions](https://github.com/hema986/mortgage-pro/actions)** tab and confirm the **Deploy to GitHub Pages** workflow run is green. If GitHub asks to approve the `github-pages` environment the first time, approve it.
4. After a successful deploy, open the live URL above. It can take a minute for the CDN to update.

To deploy again: push to `main`, or go to **Actions → Deploy to GitHub Pages → Run workflow**.

The workflow sets `VITE_BASE_PATH` to `/<repository-name>/` so JS/CSS paths work under `github.io/<repo>/`. For local development, `vite.config.ts` defaults the base to `/`.

## Scripts

| Command            | Description |
| ------------------ | ------------------------------------ |
| `npm run dev`      | Vite dev server (foreground)         |
| `npm run dev:start`| Start Vite in background (see above) |
| `npm run dev:stop` | Stop background server / free port   |
| `npm run build`    | Typecheck + production build         |
| `npm run preview`  | Preview `dist/` locally              |
| `npm run lint`     | ESLint                               |

## Project layout

```
src/
  App.tsx              # Shell, tabs, save/export Excel, theme toggle
  tabs/                # Mortgage, rental, when-to-sell screens
  components/          # Shared UI (charts, inputs, tables)
  lib/                 # Pure math helpers
  storage/             # State shape + local persistence
  hooks/               # Synced app state hook
```

## License

This project is private / all rights reserved unless you add an explicit `LICENSE` file.
