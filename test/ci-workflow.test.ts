import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ci = readFileSync(resolve(__dirname, '../.github/workflows/ci.yml'), 'utf8')

// Top-level job bodies keyed by name, from `  name:` to the next one. Commented
// lines are dropped so the #143 design note doesn't count as configuration.
const jobs = Object.fromEntries(
  ci
    .split('\njobs:\n')[1]
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('#'))
    .join('\n')
    .split(/^ {2}(?=[\w-]+:$)/m)
    .filter(Boolean)
    .map((body) => [body.slice(0, body.indexOf(':')), body])
)

describe('CI workflow', () => {
  it('pins every action to the same major everywhere it is used (#252)', () => {
    const majors = new Map<string, Set<string>>()
    for (const [, action, major] of ci.matchAll(/^\s*- uses: ([\w./-]+)@(v\d+)/gm)) {
      majors.set(action, (majors.get(action) ?? new Set()).add(major))
    }
    expect(majors.size).toBeGreaterThan(0)
    for (const [action, versions] of majors) {
      expect([...versions], action).toHaveLength(1)
    }
  })

  it.each(['test', 'build'])('runs %s on every supported Node version (#251)', (job) => {
    expect(jobs[job]).toMatch(/node: \[20, 22, 24\]/)
    expect(jobs[job]).toContain('node-version: ${{ matrix.node }}')
    // Only the Node 20 leg may fail the run; the others are informational.
    expect(jobs[job]).toContain('continue-on-error: ${{ matrix.node != 20 }}')
  })

  it.each(['lint', 'typecheck'])('keeps %s on a single Node version (#251)', (job) => {
    expect(jobs[job]).not.toContain('matrix')
  })
})
