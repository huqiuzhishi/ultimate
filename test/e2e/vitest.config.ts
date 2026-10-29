import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globalSetup: ['test/sweep-temp.ts'],
    setupFiles: ['test/setup.ts'],
    include: ['test/e2e/**/*.test.ts'],
    testTimeout: 60_000,
    // The lander stops checks with no output; report each completed test instead of buffering a whole long file.
    reporters: ['verbose'],
    // macOS process and Vite fixtures slow down under four-way contention; three workers finish sooner.
    maxWorkers: process.platform === 'darwin' ? 3 : 4,
  },
})
