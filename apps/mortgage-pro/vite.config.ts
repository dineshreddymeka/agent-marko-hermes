import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/** Set to `/<repo-name>/` when building for GitHub project pages (see `.github/workflows/deploy-pages.yml`). */
const base = process.env.VITE_BASE_PATH?.trim() || "/";

export default defineConfig({
  base,
  plugins: [react()],
});
