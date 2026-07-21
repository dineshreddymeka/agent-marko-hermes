# Property Pro

Single-page app for mortgage, cash-to-close, rental, and when-to-sell modeling. React, TypeScript, Vite, Material UI. State stays in the browser; **Export Excel** for an offline workbook.

## Quick start

```bash
git clone git@github.com:dineshreddymeka/mortgage-pro.git
cd mortgage-pro
npm install
npm run dev
```

Open the URL Vite prints (default: http://127.0.0.1:5173).

## GitHub Pages

**Live URL:** https://dineshreddymeka.github.io/mortgage-pro/

Workflow [Deploy to GitHub Pages](.github/workflows/deploy-pages.yml) builds with `npm ci && npm run build` and publishes `dist/` on push to `main` (or manual dispatch).

### First-time setup

1. Open [Settings → Pages](https://github.com/dineshreddymeka/mortgage-pro/settings/pages).
2. **Build and deployment → Source:** GitHub Actions.
3. Confirm [Actions](https://github.com/dineshreddymeka/mortgage-pro/actions) → **Deploy to GitHub Pages** is green (approve the `github-pages` environment if prompted).
4. Open the live URL above.

CI sets `VITE_BASE_PATH` to `/mortgage-pro/`. Locally the base is `/`.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build |
| `npm run preview` | Preview `dist/` |
| `npm run lint` | ESLint |

## License

Private / all rights reserved unless a `LICENSE` file is added.
