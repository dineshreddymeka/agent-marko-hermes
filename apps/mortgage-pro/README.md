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
git clone git@github.com:dineshreddymeka/mortgage-pro.git
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

**Preferred (fork):** [https://dineshreddymeka.github.io/mortgage-pro/](https://dineshreddymeka.github.io/mortgage-pro/)  
**Interim (monorepo):** [https://dineshreddymeka.github.io/agent-marko-hermes/](https://dineshreddymeka.github.io/agent-marko-hermes/)

The built site is already on the `gh-pages` branch of `agent-marko-hermes`. Enable it with one Settings click:

1. Open **[agent-marko-hermes → Settings → Pages](https://github.com/dineshreddymeka/agent-marko-hermes/settings/pages)**.
2. **Build and deployment → Source:** Deploy from a branch.
3. Branch **`gh-pages`** / folder **`/`** → Save.
4. Open the interim URL (CDN can take a minute).

### Preferred fork URL

1. Grant the Cursor GitHub App write access to `dineshreddymeka/mortgage-pro`, **or** add secret `MORTGAGE_PRO_TOKEN` on `agent-marko-hermes` and run **Sync Property Pro to fork Pages**.
2. Open **[mortgage-pro → Settings → Pages](https://github.com/dineshreddymeka/mortgage-pro/settings/pages)** → Source: **GitHub Actions**.
3. Confirm **[Actions](https://github.com/dineshreddymeka/mortgage-pro/actions)** → **Deploy to GitHub Pages** is green.

Or publish locally with your credentials:

```bash
./scripts/publish-github-pages.sh
```

CI sets `VITE_BASE_PATH` to `/<repository-name>/`. Locally, `vite.config.ts` defaults the base to `/`.

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
