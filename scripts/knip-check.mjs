// Reads knip's JSON report from stdin and compares it against the committed
// baseline (knip-baseline.json). Exit codes:
//   0 — findings match the baseline exactly
//   1 — a new finding appears (new file/export/type/dependency) or knip failed
//   2 — the baseline is stale (a baseline entry no longer appears; fix by
//       regenerating with `npm run knip:baseline`)
//
// Usage: node scripts/knip-check.mjs knip-baseline.json < knip-report.json
// See docs/unused-exports.md for the workflow and the follow-up tracker.

import { readFileSync, existsSync } from 'node:fs'
import { collect, diff } from './knip-lib.mjs'

const [baselinePath] = process.argv.slice(2)
if (!baselinePath) {
  console.error('usage: node scripts/knip-check.mjs <baseline.json> < knip-report.json')
  process.exit(1)
}

let report
{
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  try {
    report = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch (err) {
    console.error('knip-check: could not parse knip JSON output — did knip crash?', err.message)
    process.exit(1)
  }
}

const current = collect(report.issues)

if (!existsSync(baselinePath)) {
  console.error(`knip-check: baseline ${baselinePath} not found. Generate it with: npm run knip:baseline`)
  process.exit(1)
}

const baseline = new Set(JSON.parse(readFileSync(baselinePath, 'utf8')))

const { added, removed } = diff(current, baseline)

if (added.length > 0) {
  console.error(`\nknip-check: ${added.length} NEW unused-code finding(s) — fix or allowlist before merging:\n`)
  for (const x of added) console.error(`  + ${x}`)
  console.error('\nIntentionally-public exports get a /** @public */ JSDoc tag; see docs/unused-exports.md.')
}

if (removed.length > 0) {
  console.error(`\nknip-check: ${removed.length} baseline entr(y|ies) no longer appear — the baseline is stale:\n`)
  for (const x of removed) console.error(`  - ${x}`)
  console.error('\nRegenerate with: npm run knip:baseline')
}

process.exit(added.length > 0 ? 1 : removed.length > 0 ? 2 : 0)
