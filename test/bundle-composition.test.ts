import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  attributeBytes,
  decodeVlq,
  findDuplicateVersions,
  packageOfSource,
  parseMappings,
  resolveMapPath,
  rollUp,
} from '../scripts/bundle-composition.mjs'

// Base64-VLQ vectors from the Source Map v3 spec: a single digit carries the
// value in bits 1..5 with bit 0 as the sign, and a set continuation bit defers
// to the next digit.
describe('decodeVlq', () => {
  it('decodes single-digit segments', () => {
    expect(decodeVlq('A')).toEqual([0])
    expect(decodeVlq('C')).toEqual([1])
    expect(decodeVlq('D')).toEqual([-1])
  })

  it('decodes multi-digit segments little-endian', () => {
    // 'g' has the continuation bit and no payload, so 'gB' is 1 << 5.
    expect(decodeVlq('gB')).toEqual([16])
  })

  it('rejects characters outside the base64 alphabet', () => {
    expect(() => decodeVlq('!')).toThrow(/Invalid base64/)
  })
})

describe('parseMappings', () => {
  it('accumulates source fields across segments and lines', () => {
    // Line 0: col 0 -> source 0. Line 1: col 0 -> source 1, line 0, col 0.
    expect(parseMappings('AAAA;ACAA')).toEqual([
      [{ generatedColumn: 0, sourceIndex: 0, sourceLine: 0, sourceColumn: 0 }],
      [{ generatedColumn: 0, sourceIndex: 1, sourceLine: 0, sourceColumn: 0 }],
    ])
  })

  it('restarts the generated column on every line', () => {
    // The second segment's column is relative to the first, not absolute.
    expect(parseMappings('ACAA,C')[0].map((s) => s.generatedColumn)).toEqual([0, 1])
  })

  it('marks a one-field segment as having no source of its own', () => {
    expect(parseMappings('C')[0][0].sourceIndex).toBeUndefined()
  })
})

describe('attributeBytes', () => {
  it('charges each generated line to the source its segment names', () => {
    const map = { sources: ['a.js', 'b.js'], mappings: 'AAAA;ACAA' }
    expect([...attributeBytes('xx\nyy\n', map)]).toEqual([
      ['a.js', 3],
      ['b.js', 3],
    ])
  })

  it('splits a line between segments at the next generated column', () => {
    // The first segment starts at col 0 and the second at col 1, so the first
    // owns "a" and the second owns "b" plus the trailing newline.
    // Each field is its own VLQ run, so 'CCAA' is a +1 generated column and a
    // +1 source index: this second segment is b.js, starting at column 1.
    const map = { sources: ['a.js', 'b.js'], mappings: 'AAAA,CCAA' }
    expect([...attributeBytes('ab\n', map)]).toEqual([
      ['a.js', 1],
      ['b.js', 2],
    ])
  })

  it('gives a source-less segment the previous segment source', () => {
    const map = { sources: ['a.js'], mappings: 'AAAA,C' }
    expect([...attributeBytes('ab\n', map)]).toEqual([['a.js', 3]])
  })

  it('carries a source down lines that have no mappings at all', () => {
    const map = { sources: ['a.js'], mappings: 'AAAA' }
    expect([...attributeBytes('ab\ncd\n', map)]).toEqual([['a.js', 6]])
  })

  it('accounts for every byte of the file', () => {
    const code = 'const a = 1\nconst b = 2\n\n'
    const map = { sources: ['a.js'], mappings: 'AAAA;AAAA' }
    const total = [...attributeBytes(code, map)].reduce((sum, [, bytes]) => sum + bytes, 0)
    expect(total).toBe(Buffer.byteLength(code))
  })
})

describe('packageOfSource', () => {
  it('reads an unscoped package', () => {
    expect(packageOfSource('turbopack:///[project]/node_modules/lucide-react/dist/x.js')).toBe(
      'lucide-react',
    )
  })

  it('reads a scoped package as one name', () => {
    expect(packageOfSource('node_modules/@stellar/stellar-sdk/src/rpc/server.ts')).toBe(
      '@stellar/stellar-sdk',
    )
  })

  it('returns null for first-party sources', () => {
    expect(packageOfSource('turbopack:///[project]/src/lib/logger.ts')).toBeNull()
  })
})

describe('rollUp', () => {
  it('buckets packages, app code and unattributable bytes separately', () => {
    const rolled = rollUp(
      new Map([
        ['node_modules/lucide-react/dist/x.js', 10],
        ['turbopack:///[project]/src/lib/logger.ts', 20],
        ['?', 5],
      ]),
    )
    expect([...rolled.entries()].sort()).toEqual([
      ['(app code)', 20],
      ['(unattributed)', 5],
      ['lucide-react', 10],
    ])
  })
})

describe('resolveMapPath', () => {
  // Turbopack names a chunk's map independently of the chunk, so the
  // sourceMappingURL comment is the only reliable link (#266).
  it('follows sourceMappingURL rather than assuming an adjacent map', () => {
    const dir = mkdtempSync(join(tmpdir(), 'composition-'))
    const chunk = join(dir, 'chunk-a.js')
    writeFileSync(join(dir, 'other-name.js.map'), '{}')
    writeFileSync(chunk, 'code\n//# sourceMappingURL=other-name.js.map\n')
    expect(resolveMapPath(chunk, 'code\n//# sourceMappingURL=other-name.js.map\n')).toBe(
      join(dir, 'other-name.js.map'),
    )
  })

  it('falls back to an adjacent map', () => {
    const dir = mkdtempSync(join(tmpdir(), 'composition-'))
    const chunk = join(dir, 'chunk-b.js')
    writeFileSync(`${chunk}.map`, '{}')
    expect(resolveMapPath(chunk, 'code\n')).toBe(`${chunk}.map`)
  })

  it('returns null when there is no map', () => {
    const dir = mkdtempSync(join(tmpdir(), 'composition-'))
    const chunk = join(dir, 'chunk-c.js')
    writeFileSync(chunk, 'code\n')
    expect(resolveMapPath(chunk, 'code\n')).toBeNull()
  })
})

describe('findDuplicateVersions', () => {
  it('flags a package pinned at two versions', () => {
    const dir = mkdtempSync(join(tmpdir(), 'composition-'))
    const lockfile = join(dir, 'package-lock.json')
    writeFileSync(
      lockfile,
      JSON.stringify({
        packages: {
          '': { name: 'app' },
          'node_modules/debug': { version: '3.2.7' },
          'node_modules/vite/node_modules/debug': { version: '4.4.3' },
          'node_modules/semver': { version: '7.7.1' },
        },
      }),
    )
    expect(findDuplicateVersions(lockfile)).toEqual([{ name: 'debug', versions: ['3.2.7', '4.4.3'] }])
  })

  it('ignores the lockfile root, which has no version', () => {
    const dir = mkdtempSync(join(tmpdir(), 'composition-'))
    const lockfile = join(dir, 'package-lock.json')
    writeFileSync(lockfile, JSON.stringify({ packages: { '': { name: 'app' } } }))
    expect(findDuplicateVersions(lockfile)).toEqual([])
  })
})
