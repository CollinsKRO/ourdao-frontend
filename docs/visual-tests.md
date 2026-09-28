# Visual regression tests

The behaviour suite (`npm test`) proves components render and handlers fire;
it says nothing about how they look. This repo's output is entirely visual —
a removed Tailwind class, a changed token, a broken dark-mode rule all pass
lint, typecheck, tests, and build (see #67, #35). The Playwright suite run by
`npm run test:visual` closes that gap.

## What is covered

The matrix is deliberately small — a few meaningful snapshots beat exhaustive
coverage nobody waits for:

- **Routes:** the nine main routes listed in `test/visual/routes.spec.ts`
  (landing, register, dashboard, loans, governance, create-proposal, treasury,
  privacy, admin).
- **Themes:** each route is captured in **light and dark** (the two axes the
  dual-theme requirement doubles).
- **Viewports:** every test runs twice, once per Playwright project —
  `desktop` (1280×800) and `mobile` (390×844), the width that drives
  `useIsMobile` / `useResponsiveCardLayout`.

That is 9 routes × 2 themes × 2 viewports = **36 committed baselines** in
`test/visual/__screenshots__/<project>/`.

Routes render their **wallet-disconnected state**: CI has no Freighter
extension, and those gates are real UI worth protecting. Two routes are
deliberately excluded:

- `/loans/request` — redirects to `/` without a wallet, so it could only ever
  picture the landing page.
- `/loans/[id]` — raises a transient "Loan not found" toast on load, which is
  not deterministic enough to baseline.

When the component catalogue (issue #253) lands, its route is the natural
place to add per-primitive snapshots — append it to `ROUTES` rather than
inventing a second harness.

## Running locally

```bash
npx playwright install chromium   # once per machine
npm run test:visual               # boots the dev server if none is running
```

If a preview/dev server is already running, point the suite at it so no
second server is started:

```bash
VISUAL_BASE_URL=http://localhost:3000 npm run test:visual
```

`npm test` (vitest) ignores `test/visual/**`; the two suites never run
together.

## Updating a baseline deliberately

A failing visual test means one of two things: an unintended regression (fix
the code, not the baseline) or an intended design change (update the
baseline). For an intended change:

```bash
npm run test:visual -- --update-snapshots
```

Then **review every regenerated PNG in the diff before committing** — GitHub
renders image changes side-by-side in the PR. Commit only baselines whose
change you can explain; never regenerate wholesale just to turn CI green, and
never delete a failing baseline without replacing it.

In CI the `visual` job runs the same suite. It is part of the required
`Record status` check, so an unreviewed difference fails the PR, and failed
runs upload `test-results/` (actual / expected / diff PNGs) as the
`visual-diffs` artifact.

## How determinism is achieved

- **Theme** — `localStorage.theme` is seeded before any app script runs, and
  `prefers-color-scheme` is emulated to match, so next-themes boots into the
  right class with no flash.
- **Motion** — `prefers-reduced-motion: reduce` is emulated; the app already
  collapses all CSS animation under that media query (globals.css, #73).
- **Settling** — fonts are awaited (`document.fonts.ready`), every `.skeleton`
  must leave the DOM, and `toHaveScreenshot` then polls until two consecutive
  frames are identical.
- **Fonts** — Inter and JetBrains Mono come from `next/font`, so glyphs are
  embedded rather than pulled from the host system.
- **Tolerance** — `maxDiffPixelRatio: 0.002` (~2 000 px on a desktop
  viewport) absorbs antialiasing noise between Linux hosts while failing any
  real colour, spacing, or layout change.

Two known maintenance points:

- The landing footer renders `© {new Date().getFullYear()}` — baselines need
  a refresh in January.
- Screenshots are taken against the **dev server** (that is what CI boots and
  what a local preview runs), so dev-only rendering is what is baselined.
