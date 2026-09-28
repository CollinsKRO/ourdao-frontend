// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { MAX_UPLOAD_BYTES, MIN_UPLOAD_BYTES, POST } from '@/app/api/documents/route'
import { computeIPFSCIDs } from '@/lib/ipfs-cid'
import { resetRateLimits } from '@/lib/rate-limiter'

function upload(
  body: BodyInit | null,
  headers: Record<string, string> = { 'content-type': 'application/octet-stream' }
) {
  const reqHeaders = { ...headers }
  return new NextRequest('http://localhost/api/documents', {
    method: 'POST',
    body,
    headers: reqHeaders,
    ...(body instanceof ReadableStream ? { duplex: 'half' } : {}),
  } as ConstructorParameters<typeof NextRequest>[1])
}

function chunkedStream(chunks: Uint8Array[]) {
  let i = 0
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++])
      else controller.close()
    },
  })
}

// Generate valid test payload (>= MIN_UPLOAD_BYTES) and compute its CID
const validBytes = new Uint8Array(MIN_UPLOAD_BYTES).fill(65)
const validCID = computeIPFSCIDs(validBytes).cidV0

describe('POST /api/documents', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    resetRateLimits()
    vi.stubEnv('PINATA_JWT', 'test-jwt')
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    resetRateLimits()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns 503 when PINATA_JWT is unset', async () => {
    vi.stubEnv('PINATA_JWT', '')
    const res = await POST(upload(validBytes))
    expect(res.status).toBe(503)
  })

  it('returns 400 for a missing Content-Type header', async () => {
    const res = await POST(upload(validBytes, {}))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Content-Type must be application/octet-stream')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 for an invalid Content-Type header', async () => {
    const res = await POST(upload(validBytes, { 'content-type': 'text/plain' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Content-Type must be application/octet-stream')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns 400 for an empty body or payload smaller than MIN_UPLOAD_BYTES', async () => {
    const smallBytes = new Uint8Array(MIN_UPLOAD_BYTES - 1).fill(1)
    const res = await POST(upload(smallBytes))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/at least 32 bytes/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('pins the body and returns the verified hash', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ IpfsHash: validCID }), { status: 200 }))
    const res = await POST(upload(validBytes))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ hash: validCID })

    // Verify metadata was attached in the FormData sent to Pinata without member PII
    expect(fetchMock).toHaveBeenCalled()
    const callArgs = fetchMock.mock.calls[0]
    const formDataSent = callArgs[1]?.body as FormData
    expect(formDataSent).toBeDefined()
    const metadataStr = formDataSent.get('pinataMetadata') as string
    expect(metadataStr).toBeDefined()
    const metadata = JSON.parse(metadataStr)
    expect(metadata.keyvalues).toBeDefined()
    expect(metadata.keyvalues.size).toBe(String(MIN_UPLOAD_BYTES))
    expect(metadata.keyvalues.address).toBeUndefined()
    expect(metadata.keyvalues.ip).toBeUndefined()
  })

  it('rejects a declared Content-Length over the cap with 413, without reading the body', async () => {
    const res = await POST(
      upload(validBytes, {
        'content-type': 'application/octet-stream',
        'content-length': String(MAX_UPLOAD_BYTES + 1),
      })
    )
    expect(res.status).toBe(413)
    expect((await res.json()).error).toMatch(/16 MB/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a chunked body that exceeds the cap mid-stream with 413', async () => {
    const chunk = new Uint8Array(1024 * 1024)
    const stream = chunkedStream(Array.from({ length: 17 }, () => chunk))
    const res = await POST(upload(stream))
    expect(res.status).toBe(413)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts a chunked body exactly at the cap', async () => {
    const chunk = new Uint8Array(1024 * 1024)
    const maxBytes = new Uint8Array(16 * 1024 * 1024)
    for (let i = 0; i < 16; i++) {
      maxBytes.set(chunk, i * 1024 * 1024)
    }
    const maxCID = computeIPFSCIDs(maxBytes).cidV0
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ IpfsHash: maxCID }), { status: 200 }))

    const res = await POST(upload(chunkedStream(Array.from({ length: 16 }, () => chunk))))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ hash: maxCID })
  })

  it('returns 502 when the pinning provider is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'))
    const res = await POST(upload(validBytes))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('Could not reach the pinning provider')
  })

  it("does not echo the provider's error body; logs it server-side with a request id", async () => {
    const secret = '{"account":"acct_9f2","plan":"free","quota_used":"99%","request_id":"pinata-internal-1"}'
    fetchMock.mockResolvedValue(new Response(secret, { status: 401 }))
    const res = await POST(upload(validBytes))
    expect(res.status).toBe(502)
    const { error } = await res.json()
    expect(error).toMatch(/^Pinning provider rejected the upload \(request [0-9a-f-]{36}\)$/)
    expect(error).not.toContain('acct_9f2')
    expect(error).not.toContain('quota')
    const requestId = error.match(/request ([0-9a-f-]{36})/)![1]
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(requestId), secret)
  })

  it('returns 502 when provider returns non-JSON 2xx body', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Error</html>', { status: 200 }))
    const res = await POST(upload(validBytes))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('Invalid response from pinning provider')
  })

  it('returns 502 when provider 2xx response is missing IpfsHash', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ other: 'value' }), { status: 200 }))
    const res = await POST(upload(validBytes))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('Pinning provider response missing IpfsHash')
  })

  it('returns 502 when provider returned CID is malformed', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ IpfsHash: 'invalid-cid-format' }), { status: 200 }))
    const res = await POST(upload(validBytes))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('Pinning provider returned invalid or mismatched IPFS hash')
  })

  it('returns 502 when provider returned CID does not match the uploaded bytes', async () => {
    // Valid CID format for DIFFERENT bytes
    const otherBytes = new Uint8Array(MIN_UPLOAD_BYTES).fill(99)
    const mismatchedCID = computeIPFSCIDs(otherBytes).cidV0
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ IpfsHash: mismatchedCID }), { status: 200 }))

    const res = await POST(upload(validBytes))
    expect(res.status).toBe(502)
    expect((await res.json()).error).toBe('Pinning provider returned invalid or mismatched IPFS hash')
  })

  describe('Rate limiting', () => {
    it('enforces per-IP rate limits and returns 429 with Retry-After', async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ IpfsHash: validCID }), { status: 200 }))
      )
      const ipHeaders = {
        'content-type': 'application/octet-stream',
        'x-forwarded-for': '203.0.113.50',
      }

      // Exhaust IP budget (10 allowed requests)
      for (let i = 0; i < 10; i++) {
        const res = await POST(upload(validBytes, ipHeaders))
        expect(res.status).toBe(200)
      }

      // 11th request must fail with 429
      const rateLimitedRes = await POST(upload(validBytes, ipHeaders))
      expect(rateLimitedRes.status).toBe(429)
      expect(rateLimitedRes.headers.get('Retry-After')).toBeDefined()
      expect(Number(rateLimitedRes.headers.get('Retry-After'))).toBeGreaterThan(0)
      expect((await rateLimitedRes.json()).error).toMatch(/Too many upload requests/)
    })

    it('enforces per-member rate limits as tighter control than per-IP limit', async () => {
      fetchMock.mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify({ IpfsHash: validCID }), { status: 200 }))
      )
      const memberHeaders = {
        'content-type': 'application/octet-stream',
        'x-forwarded-for': '203.0.113.60',
        'x-member-address': 'GABC123MEMBERADDRESS',
      }

      // Member budget is tighter (5 allowed requests)
      for (let i = 0; i < 5; i++) {
        const res = await POST(upload(validBytes, memberHeaders))
        expect(res.status).toBe(200)
      }

      // 6th request from this member must fail with 429 even though IP is only at 5 requests
      const rateLimitedRes = await POST(upload(validBytes, memberHeaders))
      expect(rateLimitedRes.status).toBe(429)
      expect(rateLimitedRes.headers.get('Retry-After')).toBeDefined()
      expect((await rateLimitedRes.json()).error).toMatch(/Too many upload requests/)
    })
  })
})
