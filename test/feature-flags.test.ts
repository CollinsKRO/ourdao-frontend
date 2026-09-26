import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  parseFlagList,
  isFeatureEnabled,
  isDeclaredFlag,
  FEATURE_FLAGS,
  ENABLED_FLAGS,
} from '@/lib/feature-flags'

describe('parseFlagList (#274)', () => {
  it('returns an empty list when unset, empty, or only separators', () => {
    expect(parseFlagList(undefined)).toEqual([])
    expect(parseFlagList(null)).toEqual([])
    expect(parseFlagList('')).toEqual([])
    expect(parseFlagList('  ,  ')).toEqual([])
  })

  it('splits a comma-separated list and trims whitespace', () => {
    expect(parseFlagList('alpha, beta ,gamma')).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('normalises case so a hand-typed name still matches code', () => {
    expect(parseFlagList('Alpha,BETA')).toEqual(['alpha', 'beta'])
  })

  it('collapses duplicates', () => {
    expect(parseFlagList('alpha, alpha ,ALPHA')).toEqual(['alpha'])
  })
})

describe('isFeatureEnabled (#274)', () => {
  beforeEach(() => {
    vi.resetModules()
    // These tests enable flags that only exist in the test, so the
    // undeclared-flag warning would fire on every import. It's stubbed to
    // production to keep the run quiet; the warning has its own tests below.
    vi.stubEnv('NODE_ENV', 'production')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function load() {
    return import('@/lib/feature-flags')
  }

  it('is off for every flag when NEXT_PUBLIC_FEATURE_FLAGS is empty', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_FLAGS', '')
    const { isFeatureEnabled: enabled, ENABLED_FLAGS: set } = await load()

    expect(set.size).toBe(0)
    expect(enabled('anything')).toBe(false)
  })

  it('is on only for the flags named in the env var', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_FLAGS', 'risky-flow,other')
    const { isFeatureEnabled: enabled } = await load()

    expect(enabled('risky-flow')).toBe(true)
    expect(enabled('other')).toBe(true)
    expect(enabled('not-listed')).toBe(false)
  })

  it('matches case-insensitively against the code-side name', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_FLAGS', 'Risky-Flow')
    const { isFeatureEnabled: enabled } = await load()

    expect(enabled('risky-flow')).toBe(true)
    expect(enabled('RISKY-FLOW')).toBe(true)
  })

  it('fails closed for a misspelled flag name', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_FLAGS', 'risky-flow')
    const { isFeatureEnabled: enabled } = await load()

    // A typo must not accidentally enable anything — the whole point of a
    // default-off switch is that it never turns a change on by surprise.
    expect(enabled('risky-flaw')).toBe(false)
  })

  it('reads the env var at module load, so the enabled set is a snapshot', async () => {
    vi.stubEnv('NEXT_PUBLIC_FEATURE_FLAGS', 'risky-flow')
    const { isFeatureEnabled: enabled, ENABLED_FLAGS: set } = await load()

    vi.stubEnv('NEXT_PUBLIC_FEATURE_FLAGS', 'risky-flow,late-addition')
    expect(enabled('late-addition')).toBe(false)
    expect(set.has('late-addition')).toBe(false)
  })
})

describe('undeclared-flag warning (#274)', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('warns when an enabled flag is not in the FEATURE_FLAGS registry', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('NEXT_PUBLIC_FEATURE_FLAGS', 'not-declared')
    vi.stubEnv('NODE_ENV', 'development')

    await import('@/lib/feature-flags')

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not-declared'))
  })

  it('stays quiet in production', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('NEXT_PUBLIC_FEATURE_FLAGS', 'not-declared')
    vi.stubEnv('NODE_ENV', 'production')

    await import('@/lib/feature-flags')

    expect(warn).not.toHaveBeenCalled()
  })
})

describe('flag registry defaults (#274)', () => {
  it('is off for every flag with no env var — the default contributor state', () => {
    // The top-level import in this file runs against the default (unset) env,
    // which is what a contributor sees locally with no .env.local.
    expect(ENABLED_FLAGS.size).toBe(0)
    expect(isFeatureEnabled('anything')).toBe(false)
  })

  it('starts with an empty registry so every flag is off by default', () => {
    expect(Object.keys(FEATURE_FLAGS)).toEqual([])
    expect(isDeclaredFlag('anything')).toBe(false)
  })
})

describe('NEXT_PUBLIC_FEATURE_FLAGS is read statically (#274)', () => {
  it('uses a literal member expression so Next inlines it in the client bundle', () => {
    const source = readFileSync(
      resolve(__dirname, '../src/lib/feature-flags.ts'),
      'utf8'
    )
    // A computed lookup like process.env[FEATURE_FLAGS_ENV_VAR] is NOT inlined
    // by Next's NEXT_PUBLIC_* transform and would read as undefined in the
    // browser, silently disabling every flag. Guard the literal.
    expect(source).toMatch(/process\.env\.NEXT_PUBLIC_FEATURE_FLAGS/)
    expect(source).not.toMatch(/process\.env\[/)
  })
})

describe('flag registry and call sites stay in sync (#274)', () => {
  // The registry is empty and there are no call sites today, so the two
  // invariants below hold vacuously. They are here so the first flag that lands
  // can't skip the bookkeeping: a name used in code has to be declared, and a
  // declared flag has to be in the docs table. Whichever side grows first, the
  // other has to catch up in the same PR.

  const srcRoot = resolve(__dirname, '../src')
  const docsPath = resolve(__dirname, '../docs/FEATURE_FLAGS.md')

  function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) return sourceFiles(full)
      return /\.tsx?$/.test(full) ? [full] : []
    })
  }

  // Every `isFeatureEnabled('name')` literal call site under src/. The flag
  // module itself is excluded: its header comment uses a placeholder name to
  // explain the API, which is documentation rather than a call site.
  const flagModule = join(srcRoot, 'lib/feature-flags.ts')
  const callSitePattern = /isFeatureEnabled\(\s*['"]([^'"]+)['"]\s*\)/g

  const callSites = sourceFiles(srcRoot)
    .filter((file) => file !== flagModule)
    .flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return [...source.matchAll(callSitePattern)].map((m) => m[1])
    })

  it('every isFeatureEnabled() call site names a flag in the registry', () => {
    for (const name of callSites) {
      expect(
        isDeclaredFlag(name),
        `"${name}" is used in code but not declared in FEATURE_FLAGS (src/lib/feature-flags.ts)`
      ).toBe(true)
    }
  })

  it('the "Flags in flight" table in docs/FEATURE_FLAGS.md lists exactly the registry', () => {
    const docs = readFileSync(docsPath, 'utf8')
    const table = docs.split('## Flags in flight')[1]?.split('\n## ')[0] ?? ''

    // Rows look like: | `flag-name` | What it gates | #123 | date | state |
    const documented = [...table.matchAll(/^\|\s*`([^`]+)`/gm)].map((m) => m[1])

    // Parsing the table (rather than grepping the whole file) is what makes this
    // bidirectional: a doc row left behind after a flag was removed fails here,
    // not just a missing row for a flag that still exists.
    expect(documented.sort()).toEqual(Object.keys(FEATURE_FLAGS).sort())
  })
})
