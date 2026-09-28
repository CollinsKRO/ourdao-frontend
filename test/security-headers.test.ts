import { afterEach, describe, expect, it, vi } from 'vitest'
import nextConfig, { buildCsp } from '../next.config'

/**
 * Issue #239 — `buildCsp()` and the seven security headers were completely
 * untested. The CSP is env-driven (RPC / backend / IPFS origins plus ws/wss
 * variants) and deliberately swallows malformed values; the headers themselves
 * could be dropped silently by a refactor of `headers()`.
 *
 * Covers: defaults, custom origins, malformed-input isolation, every emitted
 * header, and connect-src inclusion. Out of scope: changing the policy.
 */
describe('next.config CSP and security headers (#239)', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('builds a default policy containing the default RPC, backend, and gateway origins', () => {
    // Unset so buildCsp() falls back to its compiled-in defaults.
    delete process.env.NEXT_PUBLIC_SOROBAN_RPC_URL
    delete process.env.NEXT_PUBLIC_BACKEND_URL
    delete process.env.NEXT_PUBLIC_IPFS_GATEWAY

    const csp = buildCsp()

    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain('https://soroban-testnet.stellar.org')
    expect(csp).toContain('http://localhost:4000')
    expect(csp).toContain('https://gateway.pinata.cloud')
    // ws/wss variants for http/https origins.
    expect(csp).toContain('wss://soroban-testnet.stellar.org')
    expect(csp).toContain('ws://localhost:4000')
    expect(csp).toContain('ws://localhost:*')
    expect(csp).toContain('wss://localhost:*')
  })

  it('includes custom backend, RPC, and gateway origins in connect-src', () => {
    vi.stubEnv('NEXT_PUBLIC_SOROBAN_RPC_URL', 'https://rpc.custom.dev')
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'https://api.custom.dev')
    vi.stubEnv('NEXT_PUBLIC_IPFS_GATEWAY', 'https://ipfs.custom.dev/ipfs/')

    const csp = buildCsp()
    const connectSrc = csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith('connect-src'))
    expect(connectSrc).toBeDefined()
    expect(connectSrc).toContain('https://rpc.custom.dev')
    expect(connectSrc).toContain('https://api.custom.dev')
    expect(connectSrc).toContain('https://ipfs.custom.dev')
    expect(connectSrc).toContain('wss://rpc.custom.dev')
    expect(connectSrc).toContain('wss://api.custom.dev')
  })

  it('omits only the malformed origin and still returns a valid policy', () => {
    vi.stubEnv('NEXT_PUBLIC_SOROBAN_RPC_URL', 'https://rpc.valid.dev')
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', ':::not a url:::')
    vi.stubEnv('NEXT_PUBLIC_IPFS_GATEWAY', 'https://ipfs.valid.dev/ipfs/')

    const csp = buildCsp()

    expect(csp).toContain('https://rpc.valid.dev')
    expect(csp).toContain('https://ipfs.valid.dev')
    expect(csp).not.toContain(':::not a url:::')
    // Still a valid policy with the structural directives intact.
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain('connect-src')
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
  })

  it('ignores a malformed IPFS gateway while keeping RPC and backend', () => {
    vi.stubEnv('NEXT_PUBLIC_SOROBAN_RPC_URL', 'https://soroban-testnet.stellar.org')
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:4000')
    vi.stubEnv('NEXT_PUBLIC_IPFS_GATEWAY', 'not-a-url, https://good-gateway.dev/ipfs/')

    const csp = buildCsp()

    expect(csp).toContain('https://good-gateway.dev')
    expect(csp).toContain('https://soroban-testnet.stellar.org')
    expect(csp).toContain('http://localhost:4000')
    expect(csp).not.toContain('not-a-url')
  })

  it('emits every security header with its expected value', async () => {
    const headers = await nextConfig.headers?.()
    expect(headers).toBeDefined()
    expect(headers).toHaveLength(1)
    const route = headers![0]
    expect(route.source).toBe('/(.*)')

    const byKey = new Map(route.headers.map((h) => [h.key, h.value]))

    // Seven headers — dropping any one fails this suite by design.
    expect([...byKey.keys()].sort()).toEqual(
      [
        'Content-Security-Policy',
        'Cross-Origin-Opener-Policy',
        'Permissions-Policy',
        'Referrer-Policy',
        'Strict-Transport-Security',
        'X-Content-Type-Options',
        'X-Frame-Options',
      ].sort()
    )

    expect(byKey.get('Content-Security-Policy')).toBe(buildCsp())
    expect(byKey.get('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains; preload'
    )
    expect(byKey.get('X-Content-Type-Options')).toBe('nosniff')
    expect(byKey.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(byKey.get('X-Frame-Options')).toBe('DENY')
    expect(byKey.get('Permissions-Policy')).toBe(
      'camera=(), microphone=(), geolocation=(), interest-cohort=(), browsing-topics=()'
    )
    expect(byKey.get('Cross-Origin-Opener-Policy')).toBe('same-origin')
  })

  it('keeps the CSP structural directives intact', () => {
    delete process.env.NEXT_PUBLIC_SOROBAN_RPC_URL
    delete process.env.NEXT_PUBLIC_BACKEND_URL
    delete process.env.NEXT_PUBLIC_IPFS_GATEWAY

    const csp = buildCsp()
    for (const directive of [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      'connect-src',
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "worker-src 'self' blob:",
      'media-src',
    ]) {
      expect(csp).toContain(directive)
    }
  })
})
