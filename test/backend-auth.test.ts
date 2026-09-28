import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AuthError,
  buildAuthHeader,
  buildAuthPayload,
  canSignForBackend,
  fetchAuthChallenge,
  requestSignedAuth,
  serializePerAddress,
} from '@/lib/backend-auth'

// #306 — the frontend sent bare, unauthenticated PATCHes to endpoints the
// backend protects. These tests pin the wire format itself (not just "a fetch
// happened"), because the format is the contract: ourdao-backend's
// `extractAuthHeaders` splits the header on ':' and requires exactly three
// fields, and `verifySignature` re-derives the signed payload as
// `${nonce}:${address}`.

const CONFIGURED_URL = 'http://localhost:4000'
const ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV'
const NONCE = 'f'.repeat(64)
const SIGNATURE = Buffer.from('a-signature').toString('base64')

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: () => Promise.resolve(body) } as Response
}

describe('StellarSignature auth wire format', () => {
  it('signs exactly "<nonce>:<address>"', () => {
    expect(buildAuthPayload(NONCE, ADDRESS)).toBe(`${NONCE}:${ADDRESS}`)
  })

  it('emits "StellarSignature <address>:<signature>:<nonce>"', () => {
    expect(buildAuthHeader({ address: ADDRESS, signature: SIGNATURE, nonce: NONCE })).toBe(
      `StellarSignature ${ADDRESS}:${SIGNATURE}:${NONCE}`
    )
  })

  it('produces a value the backend can split into exactly three fields', () => {
    const fields = buildAuthHeader({ address: ADDRESS, signature: SIGNATURE, nonce: NONCE })
      .slice('StellarSignature '.length)
      .split(':')
    expect(fields).toEqual([ADDRESS, SIGNATURE, NONCE])
  })

  it('treats G… and M… as signable and C… as not', () => {
    expect(canSignForBackend(ADDRESS)).toBe(true)
    expect(canSignForBackend('MABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVWXYZ6789ABC')).toBe(true)
    expect(canSignForBackend('CABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV')).toBe(false)
  })
})

describe('fetchAuthChallenge', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', CONFIGURED_URL)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('requests the challenge for the address and returns the nonce', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ nonce: NONCE }))

    await expect(fetchAuthChallenge(ADDRESS)).resolves.toBe(NONCE)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe(`${CONFIGURED_URL}/api/auth/challenge?address=${ADDRESS}`)
    expect((init as RequestInit).cache).toBe('no-store')
  })

  it('URL-encodes the address', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ nonce: NONCE }))
    await fetchAuthChallenge('GA BC')
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe(
      `${CONFIGURED_URL}/api/auth/challenge?address=GA%20BC`
    )
  })

  it('fails rather than signing when the challenge is missing from the response', async () => {
    // Guards against signing the literal string "undefined:<address>", which
    // would produce a well-formed header that can never verify.
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({}))

    await expect(fetchAuthChallenge(ADDRESS)).rejects.toMatchObject({
      name: 'AuthError',
      reason: 'challenge-rejected',
    })
  })

  it("refuses a C… account up front — it can never produce an ed25519 signature", async () => {
    await expect(fetchAuthChallenge('CABC')).rejects.toMatchObject({
      reason: 'unsupported-address',
    })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('surfaces the backend\'s 400 for an unauthenticable address as unsupported-address', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'invalid Stellar address' }, false, 400))

    await expect(fetchAuthChallenge(ADDRESS)).rejects.toMatchObject({
      reason: 'unsupported-address',
      status: 400,
    })
  })

  it('treats a 503 (nonce store at capacity) as a transient unavailability', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: 'Service temporarily unavailable' }, false, 503))

    await expect(fetchAuthChallenge(ADDRESS)).rejects.toMatchObject({
      reason: 'challenge-unavailable',
      status: 503,
    })
  })

  it('reports an unreachable backend rather than hanging', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('ECONNREFUSED'))

    await expect(fetchAuthChallenge(ADDRESS)).rejects.toBeInstanceOf(AuthError)
  })
})

describe('requestSignedAuth', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('NEXT_PUBLIC_BACKEND_URL', CONFIGURED_URL)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('returns the address, signature and nonce the caller will send', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ nonce: NONCE }))
    const signMessage = vi.fn(async () => SIGNATURE)

    await expect(requestSignedAuth({ address: ADDRESS, signMessage })).resolves.toEqual({
      address: ADDRESS,
      signature: SIGNATURE,
      nonce: NONCE,
    })
    expect(signMessage).toHaveBeenCalledWith(`${NONCE}:${ADDRESS}`)
  })

  it('reports a declined prompt as `rejected`, distinctly from a network failure', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ nonce: NONCE }))

    await expect(
      requestSignedAuth({
        address: ADDRESS,
        signMessage: async () => {
          throw new Error('User rejected the request')
        },
      })
    ).rejects.toMatchObject({ name: 'AuthError', reason: 'rejected' })
  })

  it('treats an empty signature as a rejection, not a valid one', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ nonce: NONCE }))

    await expect(
      requestSignedAuth({ address: ADDRESS, signMessage: async () => '' })
    ).rejects.toMatchObject({ reason: 'rejected' })
  })
})

describe('serializePerAddress', () => {
  it('never runs two signed mutations for the same address at once', async () => {
    // The backend's `issue()` is idempotent per address and `consume()` deletes
    // the nonce, so two overlapping mutations would sign the same nonce and the
    // second would be rejected. Serializing is what makes that impossible.
    const order: string[] = []
    const slow = async (tag: string, ms: number) => {
      order.push(`${tag}:start`)
      await new Promise((r) => setTimeout(r, ms))
      order.push(`${tag}:end`)
      return tag
    }

    const results = await Promise.all([
      serializePerAddress('GONE', () => slow('a', 20)),
      serializePerAddress('GONE', () => slow('b', 1)),
    ])

    expect(results).toEqual(['a', 'b'])
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end'])
  })

  it('does not let one address\'s failure block the next task in its chain', async () => {
    const failing = serializePerAddress('GTWO', async () => {
      throw new Error('boom')
    })
    await expect(failing).rejects.toThrow('boom')
    await expect(serializePerAddress('GTWO', async () => 'ok')).resolves.toBe('ok')
  })

  it('keeps different addresses fully parallel', async () => {
    const order: string[] = []
    const tag = (name: string) => async () => {
      order.push(`${name}:start`)
      await new Promise((r) => setTimeout(r, 5))
      order.push(`${name}:end`)
      return name
    }
    await Promise.all([serializePerAddress('GA', tag('ga')), serializePerAddress('GB', tag('gb'))])
    expect(order.slice(0, 2).sort()).toEqual(['ga:start', 'gb:start'])
  })
})
