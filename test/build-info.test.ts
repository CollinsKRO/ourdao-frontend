import { describe, expect, it } from 'vitest'
import { formatBuildInfo, isDevBuild, shortCommit } from '@/lib/build-info'
import type { BuildInfo } from '@/lib/build-info'

// The build identifier is what a bug report pastes, so its formatting is the
// contract under test: one line, absent fields omitted rather than rendered
// as empty segments, commit always shortened to 7 chars.

const base: BuildInfo = {
  version: '0.1.0',
  commit: '',
  buildTime: '',
  contractId: '',
}

describe('shortCommit', () => {
  it('shortens a full sha to 7 characters', () => {
    expect(shortCommit('681a7b4474de63f76a46ff94f5bcafd3d571212b')).toBe('681a7b4')
  })

  it('returns short shas unchanged', () => {
    expect(shortCommit('681a7b4')).toBe('681a7b4')
  })

  it('returns empty for empty input', () => {
    expect(shortCommit('')).toBe('')
  })
})

describe('formatBuildInfo', () => {
  it('renders version alone when nothing else is present (dev build)', () => {
    expect(formatBuildInfo(base)).toBe('0.1.0')
  })

  it('joins present fields with separators, omitting absent ones', () => {
    expect(
      formatBuildInfo({ ...base, commit: '681a7b4474de63f76a46ff94f5bcafd3d571212b', buildTime: '2026-09-26T12:00:00Z' })
    ).toBe('0.1.0 (681a7b4 · 2026-09-26T12:00:00Z)')
  })

  it('includes the contract id when configured', () => {
    expect(
      formatBuildInfo({ ...base, commit: '681a7b4', contractId: 'CABCDEF123' })
    ).toBe('0.1.0 (681a7b4 · CABCDEF123)')
  })

  it('never renders dangling separators for a lone contract id', () => {
    expect(formatBuildInfo({ ...base, contractId: 'CABCDEF123' })).toBe('0.1.0 (CABCDEF123)')
  })
})

describe('isDevBuild', () => {
  it('is true when neither commit nor build time was stamped', () => {
    expect(isDevBuild(base)).toBe(true)
  })

  it('is false once CI stamps the commit even without a build time', () => {
    expect(isDevBuild({ ...base, commit: '681a7b4' })).toBe(false)
  })

  it('is false for a build time alone', () => {
    expect(isDevBuild({ ...base, buildTime: '2026-09-26T12:00:00Z' })).toBe(false)
  })
})
