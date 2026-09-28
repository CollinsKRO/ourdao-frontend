// Regenerates knip-baseline.json from a fresh knip run, or with --check
// verifies the committed baseline matches what knip currently reports (exit 1
// on drift — a stale baseline means a follow-up was fixed or knip's output
// changed, and the committed file needs a reviewed regeneration).
//
// Usage:
//   node scripts/knip-baseline.mjs            # regenerate
//   node scripts/knip-baseline.mjs --check    # CI: fail if committed baseline is stale

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { collect } from './knip-lib.mjs'

const check = process.argv.includes('--check')

const result = spawnSync('npx', ['knip', '--reporter', 'json'], {
  stdio: ['ignore', 'pipe', 'inherit'],
  maxBuffer: 16 * 1024 * 1024,
})
// knip exits 1 whenever the report contains findings (i.e. always, while the
// baseline is non-empty), so the status says nothing about whether a report was
// produced — judge by stdout instead.
if (result.error) {
  console.error('knip-baseline: failed to run knip:', result.error.message)
  process.exit(1)
}
if (!result.stdout || result.stdout.length === 0) {
  console.error(`knip-baseline: knip produced no JSON report (exit ${result.status}) — see stderr above`)
  process.exit(1)
}

const report = JSON.parse(result.stdout.toString('utf8'))
const findings = [...collect(report.issues)].sort()

if (check) {
  const committed = JSON.parse(readFileSync('knip-baseline.json', 'utf8'))
  const drift = JSON.stringify(committed) !== JSON.stringify(findings)
  if (drift) {
    console.error('knip-baseline: committed baseline is stale. Regenerate with: npm run knip:baseline')
    process.exit(1)
  }
  console.log('knip-baseline: baseline is current')
  process.exit(0)
}

writeFileSync('knip-baseline.json', JSON.stringify(findings, null, 2) + '\n')
console.log(`knip-baseline: wrote ${findings.length} finding(s) to knip-baseline.json`)
