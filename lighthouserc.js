// Lighthouse CI config (#246).
//
// Runs against a real production build served by `next start` (this app has
// no `output: 'export'` in next.config.ts, so it's a standard server build,
// not a static export) — `startServerCommand` builds nothing itself; the CI
// job runs `next build` first and this just starts the already-built app.
//
// Routes covered are the top-level, statically-addressable routes under
// src/app — the home page, the (app) route group's top-level pages, and
// /register. `/loans/[id]` is a dynamic route with no fixed id to hit
// without a seeded backend/contract state, so it's intentionally excluded
// here rather than pointed at a placeholder id that may 404.
//
// BUDGETS BELOW ARE PLACEHOLDERS, NOT A MEASURED BASELINE (#246): this
// config was written without ever running `lhci autorun` against this app,
// so the numbers are reasonable-sounding defaults (roughly: "a Core Web
// Vitals 'good' threshold, with a little headroom"), not this app's actual
// first-run numbers. The issue's ask — "commit a baseline and report the
// current numbers" — requires a real CI run to produce those numbers; that
// run hasn't happened yet. Once the `lighthouse-ci` CI job (see
// .github/workflows/ci.yml) runs for the first time, replace every budget
// below with numbers derived from that run (e.g. observed value + ~10-15%
// headroom), and remove this notice.
module.exports = {
  ci: {
    collect: {
      // `next build` runs as a separate CI step so its output is cached
      // normally; this only starts the server LHCI hits.
      startServerCommand: 'npm run start',
      startServerReadyPattern: 'Ready in',
      startServerReadyTimeout: 30000,
      url: [
        'http://localhost:3000/',
        'http://localhost:3000/register',
        'http://localhost:3000/dashboard',
        'http://localhost:3000/governance',
        'http://localhost:3000/governance/create',
        'http://localhost:3000/loans',
        'http://localhost:3000/loans/request',
        'http://localhost:3000/treasury',
        'http://localhost:3000/privacy',
        'http://localhost:3000/admin',
      ],
      numberOfRuns: 3,
      settings: {
        // Headless Chrome in CI has no real network throttling profile to
        // match against a device in the field; run unthrottled and let the
        // budgets below carry the signal instead of simulated-network noise.
        throttlingMethod: 'simulate',
      },
    },
    assert: {
      assertions: {
        // --- Core Web Vitals -------------------------------------------
        // LCP: "good" is <2500ms per web.dev; budget set slightly above
        // that to leave headroom for CI-runner variance until a real
        // baseline replaces this.
        'largest-contentful-paint': ['error', { maxNumericValue: 3000 }],
        // CLS: "good" is <0.1 per web.dev; kept at the good threshold since
        // layout shift budgets don't need CI-variance headroom the way
        // timing metrics do.
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        // INP isn't reliably measurable in a synthetic/lab Lighthouse run
        // (it needs real user interaction), so Total Blocking Time is used
        // as the lab proxy Lighthouse itself recommends. "Good" TBT is
        // <200ms; budget set slightly above that for the same CI-variance
        // reason as LCP.
        'total-blocking-time': ['error', { maxNumericValue: 300 }],
        // --- Supporting metrics (non-blocking for now) ------------------
        // Tracked as warnings rather than hard failures until a baseline
        // exists — flip to 'error' with a real threshold after the first
        // run.
        'first-contentful-paint': ['warn', { maxNumericValue: 2000 }],
        'speed-index': ['warn', { maxNumericValue: 4000 }],
      },
    },
    upload: {
      // No LHCI server / Google Cloud Storage target is configured for this
      // repo yet — reports are kept as CI job output (temporary-public-storage
      // uploads a shareable link into the job log) rather than a persisted
      // dashboard. Revisit once a baseline exists and persistence is worth
      // setting up.
      target: 'temporary-public-storage',
    },
  },
}
