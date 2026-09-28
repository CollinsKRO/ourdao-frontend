import { configDefaults, defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: false,
    // Playwright's visual specs live under test/visual and run via
    // `npm run test:visual`, not vitest (see docs/visual-tests.md).
    exclude: [...configDefaults.exclude, 'test/visual/**'],
    // The default 5000ms is tight for real component renders + userEvent
    // interactions (vs. this suite's earlier headless hook-only tests) —
    // raised so a slow CI runner/disk doesn't turn legitimate work into a
    // false timeout.
    testTimeout: 15000,
  },
})
