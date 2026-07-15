import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Match the app's JSX runtime (react-jsx); without this, esbuild compiles
  // JSX in imported .tsx sources to React.createElement and tests throw
  // "React is not defined".
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@app': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../packages/shared/src'),
      '@hermes/shared': path.resolve(__dirname, '../packages/shared/src'),
    },
  },
  test: {
    environment: 'happy-dom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/vitest.setup.ts'],
  },
})
