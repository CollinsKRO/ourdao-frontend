import { afterEach, describe, expect, it, vi } from 'vitest'
import nextConfig, { buildImageRemotePatterns } from '../next.config'

describe('next.config image remotePatterns for IPFS gateways (#245)', () => {
  const originalEnv = process.env.NEXT_PUBLIC_IPFS_GATEWAY

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NEXT_PUBLIC_IPFS_GATEWAY = originalEnv
    } else {
      delete process.env.NEXT_PUBLIC_IPFS_GATEWAY
    }
    vi.unstubAllEnvs()
  })

  it('provides default remote pattern for pinata gateway when env is unset', () => {
    delete process.env.NEXT_PUBLIC_IPFS_GATEWAY
    const patterns = buildImageRemotePatterns()

    expect(patterns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          protocol: 'https',
          hostname: 'gateway.pinata.cloud',
          pathname: '/ipfs/**',
        }),
      ])
    )
  })

  it('derives remote patterns from comma-separated NEXT_PUBLIC_IPFS_GATEWAY', () => {
    process.env.NEXT_PUBLIC_IPFS_GATEWAY =
      'https://ipfs.io/ipfs/, http://localhost:8080/ipfs/, https://custom-gateway.xyz:9000/content'
    const patterns = buildImageRemotePatterns()

    expect(patterns).toHaveLength(3)
    expect(patterns[0]).toEqual({
      protocol: 'https',
      hostname: 'ipfs.io',
      pathname: '/ipfs/**',
    })
    expect(patterns[1]).toEqual({
      protocol: 'http',
      hostname: 'localhost',
      port: '8080',
      pathname: '/ipfs/**',
    })
    expect(patterns[2]).toEqual({
      protocol: 'https',
      hostname: 'custom-gateway.xyz',
      port: '9000',
      pathname: '/content/**',
    })
  })

  it('handles root path gateways by permitting /** wildcard', () => {
    process.env.NEXT_PUBLIC_IPFS_GATEWAY = 'https://w3s.link'
    const patterns = buildImageRemotePatterns()

    expect(patterns).toEqual([
      {
        protocol: 'https',
        hostname: 'w3s.link',
        pathname: '/**',
      },
    ])
  })

  it('deduplicates identical gateway URLs in env', () => {
    process.env.NEXT_PUBLIC_IPFS_GATEWAY =
      'https://gateway.pinata.cloud/ipfs/, https://gateway.pinata.cloud/ipfs/'
    const patterns = buildImageRemotePatterns()

    expect(patterns).toHaveLength(1)
    expect(patterns[0].hostname).toBe('gateway.pinata.cloud')
  })

  it('configures nextConfig with modern image formats and remotePatterns', () => {
    expect(nextConfig.images).toBeDefined()
    expect(nextConfig.images?.formats).toEqual(['image/avif', 'image/webp'])
    expect(Array.isArray(nextConfig.images?.remotePatterns)).toBe(true)
    expect(nextConfig.images?.remotePatterns?.length).toBeGreaterThan(0)
  })
})
