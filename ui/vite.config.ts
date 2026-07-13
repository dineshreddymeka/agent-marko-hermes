import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import path from 'node:path'

const HERMES_TARGET = process.env.HERMES_URL || 'http://127.0.0.1:9119'

export default defineConfig({
  plugins: [
    TanStackRouterVite({
      routesDirectory: './src/routes',
      generatedRouteTree: './src/routeTree.gen.ts',
    }),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', { target: '19' }]],
      },
    }),
  ],
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../packages/shared/src'),
      '@hermes/shared': path.resolve(__dirname, '../packages/shared/src'),
    },
  },
  worker: {
    format: 'es',
  },
  build: {
    outDir: path.resolve(__dirname, '../hermes/hermes_cli/web_dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    proxy: {
      // Direct to Hermes FastAPI — no Bun :3001 middle layer.
      '/api': {
        target: HERMES_TARGET,
        changeOrigin: true,
      },
      '/agui': {
        target: HERMES_TARGET,
        changeOrigin: true,
      },
    },
  },
})
