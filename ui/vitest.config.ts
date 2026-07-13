import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
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
