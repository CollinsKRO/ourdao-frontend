import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the PINATA_JWT env var
const originalPinataJwt = process.env.PINATA_JWT
const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL
const originalAppOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN

describe('POST /api/documents', () => {
  beforeEach(() => {
    vi.stubEnv('PINATA_JWT', 'test-jwt-token')
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:4000')
    vi.stubEnv('NEXT_PUBLIC_APP_ORIGIN', 'http://localhost:3000')
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    process.env.PINATA_JWT = originalPinataJwt
    process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl
    process.env.NEXT_PUBLIC_APP_ORIGIN = originalAppOrigin
  })

  function createRequest(
    body: ArrayBuffer,
    headers: Record<string, string> = {}
  ): NextRequest {
    return new NextRequest('http://localhost:3000/api/documents', {
      method: 'POST',
      body,
      headers,
    })
  }

  it('rejects unauthenticated requests (no Authorization header)', async () => {
    const { POST } = await import('@/app/api/documents/route')
    const req = createRequest(new ArrayBuffer(10))
    const res = await POST(req)
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Authentication required')
  })

  it('rejects requests with invalid Authorization header format', async () => {
    const { POST } = await import('@/app/api/documents/route')
    const req = createRequest(new ArrayBuffer(10), {
      authorization: 'InvalidFormat token',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('rejects requests without x-stellar-address header', async () => {
    const { POST } = await import('@/app/api/documents/route')
    const req = createRequest(new ArrayBuffer(10), {
      authorization: 'Bearer signature123',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('rejects requests from unauthorized origin', async () => {
    const { POST } = await import('@/app/api/documents/route')
    const req = createRequest(new ArrayBuffer(10), {
      authorization: 'Bearer signature123',
      'x-stellar-address': 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234',
      origin: 'https://evil-site.com',
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Invalid origin')
  })

  it('rejects when backend auth verification fails', async () => {
    const { POST } = await import('@/app/api/documents/route')
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response)

    const req = createRequest(new ArrayBuffer(10), {
      authorization: 'Bearer signature123',
      'x-stellar-address': 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('rejects when backend says user is not a member', async () => {
    const { POST } = await import('@/app/api/documents/route')
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ valid: true, isMember: false }),
    } as Response)

    const req = createRequest(new ArrayBuffer(10), {
      authorization: 'Bearer signature123',
      'x-stellar-address': 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234',
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 503 when PINATA_JWT is not configured', async () => {
    vi.unstubAllEnvs()
    vi.stubEnv('PINATA_JWT', '')
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', 'http://localhost:4000')
    vi.stubEnv('NEXT_PUBLIC_APP_ORIGIN', 'http://localhost:3000')

    const { POST } = await import('@/app/api/documents/route')
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ valid: true, isMember: true }),
    } as Response)

    const req = createRequest(new ArrayBuffer(10), {
      authorization: 'Bearer signature123',
      'x-stellar-address': 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234',
    })
    const res = await POST(req)
    expect(res.status).toBe(503)
    const body = await res.json()
    // Should not reveal whether PINATA_JWT is configured
    expect(body.error).not.toContain('PINATA_JWT')
  })

  it('rejects empty upload', async () => {
    const { POST } = await import('@/app/api/documents/route')
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ valid: true, isMember: true }),
    } as Response)

    const req = createRequest(new ArrayBuffer(0), {
      authorization: 'Bearer signature123',
      'x-stellar-address': 'GABCDEF1234567890ABCDEF1234567890ABCDEF1234567890ABCDEF1234',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Empty upload')
  })
})
