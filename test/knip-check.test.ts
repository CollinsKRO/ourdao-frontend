// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { collect, diff } from '../scripts/knip-lib.mjs'

// knip's JSON report nests per-file issues; collect() flattens them into the
// "kind:file:name" strings the committed baseline stores. If flattening drifts
// from what knip emits, CI either blocks every PR with phantom findings (or,
// worse, silently ignores a real new category) — these tests pin the mapping.

describe('collect', () => {
  it('flattens exports, types and dependencies into kind:file:name strings', () => {
    const issues = [
      {
        file: 'src/lib/utils.ts',
        exports: [{ name: 'formatAddress' }, { name: 'generateCommitment' }],
        types: [{ name: 'DaoWrite' }],
      },
      { file: 'package.json', dependencies: [{ name: '@radix-ui/react-avatar' }] },
    ]
    expect(collect(issues)).toEqual(
      new Set([
        'export:src/lib/utils.ts:formatAddress',
        'export:src/lib/utils.ts:generateCommitment',
        'type:src/lib/utils.ts:DaoWrite',
        'dep:package.json:@radix-ui/react-avatar',
      ])
    )
  })

  it('maps a whole-file finding to file:<path> via the files array', () => {
    const issues = [
      {
        file: 'src/components/ui/avatar.tsx',
        files: ['src/components/ui/avatar.tsx'],
      },
    ]
    expect(collect(issues)).toEqual(new Set(['file:src/components/ui/avatar.tsx']))
  })

  it('does not treat the per-entry file string as a whole-file finding', () => {
    // Regression: knip entries always carry `file` (a string). Iterating that
    // string must never emit per-character "file:..." garbage — only the
    // `files` array means "the whole file is unused".
    const issues = [{ file: 'src/lib/backend.ts', exports: [{ name: 'BACKEND_URL' }] }]
    const found = collect(issues)
    expect(found.has('file:src/lib/backend.ts')).toBe(false)
    expect(found).toEqual(new Set(['export:src/lib/backend.ts:BACKEND_URL']))
  })

  it('passes unknown kinds through rather than silently dropping them', () => {
    // knip adds new issue types between releases; an unmapped kind must still
    // produce diffable entries so a surprising new category can't slip through.
    const issues = [{ file: 'src/x.ts', brandNewKind: [{ name: 'thing' }] }]
    expect(collect(issues)).toEqual(new Set(['brandNewKind:src/x.ts:thing']))
  })

  it('handles a file entry with both a whole-file finding and named exports', () => {
    const issues = [
      {
        file: 'src/lib/stellar.ts',
        files: ['src/lib/stellar.ts'],
        exports: [{ name: 'SOROBAN_RPC_URL' }],
      },
    ]
    expect(collect(issues)).toEqual(
      new Set(['file:src/lib/stellar.ts', 'export:src/lib/stellar.ts:SOROBAN_RPC_URL'])
    )
  })
})

describe('diff', () => {
  const baseline = new Set(['export:a.ts:gone', 'export:b.ts:kept'])

  it('reports baseline entries no longer reported as removed', () => {
    const { added, removed } = diff(new Set(['export:b.ts:kept']), baseline)
    expect(added).toEqual([])
    expect(removed).toEqual(['export:a.ts:gone'])
  })

  it('reports findings missing from the baseline as added', () => {
    const { added, removed } = diff(
      new Set(['export:a.ts:gone', 'export:b.ts:kept', 'export:c.ts:new']),
      baseline
    )
    expect(added).toEqual(['export:c.ts:new'])
    expect(removed).toEqual([])
  })

  it('is empty when current matches baseline exactly', () => {
    const { added, removed } = diff(baseline, baseline)
    expect(added).toEqual([])
    expect(removed).toEqual([])
  })

  it('sorts both sides for stable output', () => {
    const current = new Set(['export:z.ts:x', 'export:a.ts:y', 'export:b.ts:kept'])
    const { added } = diff(current, baseline)
    expect(added).toEqual(['export:a.ts:y', 'export:z.ts:x'])
  })
})

describe('committed baseline hygiene', () => {
  it('is sorted and free of duplicates so regeneration stays deterministic', () => {
    const entries: string[] = JSON.parse(readFileSync('knip-baseline.json', 'utf8'))
    expect(entries.length).toBeGreaterThan(0)
    expect([...entries].sort()).toEqual(entries)
    expect(new Set(entries).size).toBe(entries.length)
  })
})
