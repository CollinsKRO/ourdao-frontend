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
    // Issue #240: coverage is measured per file with the V8 provider.
    // The provider itself (@vitest/coverage-v8@4.1.11, pinned to the vitest
    // version) is installed in CI via `npm install --no-save` (see
    // .github/workflows/ci.yml) so `npm ci` stays lockfile-clean without a
    // local install step. Thresholds are intentionally at initial-adoption
    // levels (ratchet, not gate) — the first CI summary publishes the real
    // per-file numbers, and follow-ups raise these and open gaps as issues.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        '**/*.test.{ts,tsx}',
        'test/**',
        'src/__tests__/**',
        '**/*.d.ts',
        'next.config.ts',
        'next-env.d.ts',
        'postcss.config.*',
        'tailwind.config.*',
        'vitest.config.mts',
        'vitest.setup.*',
        'scripts/**',
        'public/**',
        '.next/**',
        'out/**',
        'build/**',
        'coverage/**',
      ],
      thresholds: {
        lines: 40,
        functions: 40,
        branches: 40,
        statements: 40,
      },
    },
  },
})
