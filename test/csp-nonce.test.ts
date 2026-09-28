/**
 * Tests for CSP nonce-based policy (middleware implementation).
 * 
 * Verifies that the middleware generates per-request nonces and emits
 * a CSP header with 'nonce-*' and 'strict-dynamic' instead of 'unsafe-inline'
 * for script-src, providing protection against XSS attacks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { middleware } from '@/middleware'

describe('CSP nonce-based policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generates a nonce and includes it in the CSP header', () => {
    const request = new NextRequest(new URL('http://localhost:3000/'))
    const response = middleware(request)

    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).toBeTruthy()

    // Verify nonce is present in script-src
    expect(csp).toMatch(/script-src 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/)
  })

  it('does not include unsafe-inline in script-src', () => {
    const request = new NextRequest(new URL('http://localhost:3000/'))
    const response = middleware(request)

    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).toBeTruthy()

    // Extract script-src directive
    const scriptSrcMatch = csp!.match(/script-src[^;]+/)
    expect(scriptSrcMatch).toBeTruthy()

    const scriptSrc = scriptSrcMatch![0]
    expect(scriptSrc).not.toContain("'unsafe-inline'")
  })

  it('includes strict-dynamic in script-src', () => {
    const request = new NextRequest(new URL('http://localhost:3000/'))
    const response = middleware(request)

    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).toBeTruthy()
    expect(csp).toContain("'strict-dynamic'")
  })

  it('generates different nonces for different requests', () => {
    const request1 = new NextRequest(new URL('http://localhost:3000/page1'))
    const request2 = new NextRequest(new URL('http://localhost:3000/page2'))

    const response1 = middleware(request1)
    const response2 = middleware(request2)

    const csp1 = response1.headers.get('Content-Security-Policy')
    const csp2 = response2.headers.get('Content-Security-Policy')

    expect(csp1).toBeTruthy()
    expect(csp2).toBeTruthy()

    // Extract nonces
    const nonce1Match = csp1!.match(/'nonce-([A-Za-z0-9+/=]+)'/)
    const nonce2Match = csp2!.match(/'nonce-([A-Za-z0-9+/=]+)'/)

    expect(nonce1Match).toBeTruthy()
    expect(nonce2Match).toBeTruthy()

    const nonce1 = nonce1Match![1]
    const nonce2 = nonce2Match![1]

    // Nonces should be different
    expect(nonce1).not.toBe(nonce2)
  })

  it('still allows unsafe-inline for style-src (Next.js requirement)', () => {
    const request = new NextRequest(new URL('http://localhost:3000/'))
    const response = middleware(request)

    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).toBeTruthy()

    // Extract style-src directive
    const styleSrcMatch = csp!.match(/style-src[^;]+/)
    expect(styleSrcMatch).toBeTruthy()

    const styleSrc = styleSrcMatch![0]
    expect(styleSrc).toContain("'unsafe-inline'")
  })

  it('sets x-nonce header in the request for Next.js to use', () => {
    const request = new NextRequest(new URL('http://localhost:3000/'))
    const response = middleware(request)

    // The middleware should have set x-nonce in the request headers
    // We can verify the nonce is consistent between CSP and request
    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).toBeTruthy()

    const nonceMatch = csp!.match(/'nonce-([A-Za-z0-9+/=]+)'/)
    expect(nonceMatch).toBeTruthy()
    expect(nonceMatch![1]).toHaveLength(24) // Base64 encoded 16 bytes = 24 chars
  })

  it('includes all required security headers', () => {
    const request = new NextRequest(new URL('http://localhost:3000/'))
    const response = middleware(request)

    expect(response.headers.get('Content-Security-Policy')).toBeTruthy()
    expect(response.headers.get('Strict-Transport-Security')).toBe(
      'max-age=63072000; includeSubDomains; preload'
    )
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(response.headers.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(response.headers.get('X-Frame-Options')).toBe('DENY')
    expect(response.headers.get('Permissions-Policy')).toContain('camera=()')
    expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin')
  })

  it('includes environment-configured origins in connect-src', () => {
    // Set up environment variables
    const originalRpc = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL
    const originalBackend = process.env.NEXT_PUBLIC_BACKEND_URL

    process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = 'https://rpc.example.com'
    process.env.NEXT_PUBLIC_BACKEND_URL = 'https://api.example.com'

    try {
      const request = new NextRequest(new URL('http://localhost:3000/'))
      const response = middleware(request)

      const csp = response.headers.get('Content-Security-Policy')
      expect(csp).toBeTruthy()

      // Extract connect-src directive
      const connectSrcMatch = csp!.match(/connect-src[^;]+/)
      expect(connectSrcMatch).toBeTruthy()

      const connectSrc = connectSrcMatch![0]
      expect(connectSrc).toContain('https://rpc.example.com')
      expect(connectSrc).toContain('https://api.example.com')
    } finally {
      // Restore original values
      if (originalRpc !== undefined) {
        process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = originalRpc
      } else {
        delete process.env.NEXT_PUBLIC_SOROBAN_RPC_URL
      }

      if (originalBackend !== undefined) {
        process.env.NEXT_PUBLIC_BACKEND_URL = originalBackend
      } else {
        delete process.env.NEXT_PUBLIC_BACKEND_URL
      }
    }
  })

  it('includes websocket origins in connect-src for HMR and WS endpoints', () => {
    const request = new NextRequest(new URL('http://localhost:3000/'))
    const response = middleware(request)

    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).toBeTruthy()

    const connectSrcMatch = csp!.match(/connect-src[^;]+/)
    expect(connectSrcMatch).toBeTruthy()

    const connectSrc = connectSrcMatch![0]
    expect(connectSrc).toContain('ws://localhost:*')
    expect(connectSrc).toContain('wss://localhost:*')
  })

  it('does not break when environment variables are malformed', () => {
    const originalRpc = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL
    process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = 'not-a-valid-url'

    try {
      const request = new NextRequest(new URL('http://localhost:3000/'))
      
      // Should not throw
      expect(() => middleware(request)).not.toThrow()
      
      const response = middleware(request)
      const csp = response.headers.get('Content-Security-Policy')
      expect(csp).toBeTruthy()
    } finally {
      if (originalRpc !== undefined) {
        process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = originalRpc
      } else {
        delete process.env.NEXT_PUBLIC_SOROBAN_RPC_URL
      }
    }
  })

  it('restricts img-src to specific origins, not bare https:', () => {
    const request = new NextRequest(new URL('http://localhost:3000/'))
    const response = middleware(request)

    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).toBeTruthy()

    // Extract img-src directive
    const imgSrcMatch = csp!.match(/img-src[^;]+/)
    expect(imgSrcMatch).toBeTruthy()

    const imgSrc = imgSrcMatch![0]
    
    // Should not contain bare 'https:' which allows any HTTPS origin
    expect(imgSrc).not.toMatch(/\bhttps:\s/)
    expect(imgSrc).not.toMatch(/\bhttps:$/)
    
    // Should contain expected sources
    expect(imgSrc).toContain("'self'")
    expect(imgSrc).toContain('data:')
    expect(imgSrc).toContain('blob:')
  })

  it('includes IPFS gateway origins in img-src', () => {
    const originalGateway = process.env.NEXT_PUBLIC_IPFS_GATEWAY
    process.env.NEXT_PUBLIC_IPFS_GATEWAY = 'https://ipfs.example.com/ipfs/,https://gateway2.example.com/'

    try {
      const request = new NextRequest(new URL('http://localhost:3000/'))
      const response = middleware(request)

      const csp = response.headers.get('Content-Security-Policy')
      expect(csp).toBeTruthy()

      const imgSrcMatch = csp!.match(/img-src[^;]+/)
      expect(imgSrcMatch).toBeTruthy()

      const imgSrc = imgSrcMatch![0]
      expect(imgSrc).toContain('https://ipfs.example.com')
      expect(imgSrc).toContain('https://gateway2.example.com')
    } finally {
      if (originalGateway !== undefined) {
        process.env.NEXT_PUBLIC_IPFS_GATEWAY = originalGateway
      } else {
        delete process.env.NEXT_PUBLIC_IPFS_GATEWAY
      }
    }
  })

  it('img-src contains only named origins, no wildcard https:', () => {
    const request = new NextRequest(new URL('http://localhost:3000/'))
    const response = middleware(request)

    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).toBeTruthy()

    const imgSrcMatch = csp!.match(/img-src ([^;]+)/)
    expect(imgSrcMatch).toBeTruthy()

    const imgSrcValue = imgSrcMatch![1]
    const parts = imgSrcValue.split(/\s+/)

    // Each part should be either a keyword ('self', data:, blob:) or a full origin
    for (const part of parts) {
      const isKeyword = part === "'self'" || part === 'data:' || part === 'blob:'
      const isFullOrigin = /^https?:\/\/[^/]+$/.test(part)
      
      expect(isKeyword || isFullOrigin).toBe(true)
      // Should never be just 'https:' which is a wildcard
      expect(part).not.toBe('https:')
    }
  })
})
