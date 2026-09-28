import { defineConfig } from '@playwright/test'

/**
 * Visual regression suite (#270).
 *
 * Matrix: each spec's route × {light, dark} theme, run once per viewport
 * project (desktop / mobile). Baselines are committed under
 * `test/visual/__screenshots__/<project>/` and CI fails on any unreviewed
 * difference — see docs/visual-tests.md for the policy and for how to
 * update a baseline deliberately.
 */
export default defineConfig({
  testDir: './test/visual',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Two workers keep the suite under a couple of minutes without starving
  // the dev server (or a laptop) — this matrix is deliberately small.
  workers: 2,
  reporter: process.env.CI ? [['list'], ['github']] : [['list']],
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  expect: {
    // A couple of thousand pixels of antialiasing noise are tolerated;
    // anything larger — a colour, spacing, or layout change — fails CI.
    // 0.2% of a 1280×800 viewport ≈ 2 000 px.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.002,
      caret: 'hide',
      animations: 'disabled',
      scale: 'css',
    },
    // Double the default so a cold route compile on the dev server doesn't
    // surface as a screenshot timeout.
    timeout: 20_000,
  },
  use: {
    baseURL: process.env.VISUAL_BASE_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1280, height: 800 } },
    },
    {
      // The width drives `useIsMobile` / `useResponsiveCardLayout`; the
      // second viewport is what the responsive hooks actually branch on.
      name: 'mobile',
      use: { viewport: { width: 390, height: 844 } },
    },
  ],
  // In CI Playwright boots the dev server itself. Locally, point
  // VISUAL_BASE_URL at the already-running preview instead — with it set no
  // server is ever started from a test run.
  webServer: process.env.VISUAL_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
})
