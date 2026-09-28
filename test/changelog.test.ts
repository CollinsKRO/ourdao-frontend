import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import pkg from '../package.json'
import contractInterface from '../contract/interface.json'

const changelog = readFileSync(resolve(__dirname, '../CHANGELOG.md'), 'utf8')
// Each `## [x]` heading through to the next one.
const sections = changelog.split(/^## /m).slice(1)

describe('CHANGELOG.md (#250)', () => {
  it('has an Unreleased section and an entry for the current package version', () => {
    const headings = sections.map((s) => s.split('\n')[0])
    expect(headings[0]).toBe('[Unreleased]')
    expect(headings.some((h) => h.startsWith(`[${pkg.version}]`))).toBe(true)
  })

  it('names the backend and contract versions every entry targets', () => {
    for (const section of sections) {
      expect(section, section.split('\n')[0]).toMatch(/^Backend: ourdao-backend \S.*$/m)
      expect(section, section.split('\n')[0]).toMatch(/^Contracts: ourdao-contracts \S.*$/m)
    }
  })

  it('pins Unreleased to the contract commit in contract/interface.json', () => {
    const pinned = contractInterface._last_verified.split('@')[1].trim()
    expect(sections[0]).toContain(`Contracts: ourdao-contracts @ ${pinned}`)
  })
})

describe('next.config build identity and dev-only routes', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('inlines the package version and deploy commit for the UI build label', async () => {
    vi.stubEnv('VERCEL_GIT_COMMIT_SHA', '')
    vi.stubEnv('GITHUB_SHA', 'abc1234def')
    const { default: config } = await import('../next.config')
    expect(config.env).toEqual({ NEXT_PUBLIC_APP_VERSION: pkg.version, NEXT_PUBLIC_GIT_SHA: 'abc1234def' })
  })

  it('serves page.dev.tsx routes only outside production builds (#253)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const { default: prod } = await import('../next.config')
    expect(prod.pageExtensions).not.toContain('dev.tsx')

    vi.resetModules()
    vi.stubEnv('NODE_ENV', 'development')
    const { default: dev } = await import('../next.config')
    expect(dev.pageExtensions).toContain('dev.tsx')
  })
})
