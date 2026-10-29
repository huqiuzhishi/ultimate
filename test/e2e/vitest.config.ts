import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['test/sweep-temp.ts'],
    setupFiles: ['test/setup.ts'],
    include: ['test/e2e/**/*.test.ts'],
    testTimeout: 60_000,
    // macOS process and Vite fixtures slow down under four-way contention; three workers finish sooner.
    maxWorkers: process.platform === 'darwin' ? 3 : 4,
  },
})
