import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { verifyIPFSHash } from '@/lib/ipfs-cid'
import { checkRateLimit } from '@/lib/rate-limiter'

/**
 * Hard cap on an upload body. The client limits plaintext to 10 MB
 * (DocumentUpload's `maxSize`); the binary encryption envelope adds only a
 * fixed 53-byte header and tag, and documents uploaded in the older
 * base64-framed format were up to a third larger. 16 MB covers both without
 * letting an anonymous caller make the server allocate arbitrary amounts of
 * memory.
 */
export const MAX_UPLOAD_BYTES = 16 * 1024 * 1024

/**
 * Minimum plausible byte size for an encrypted payload envelope
 * (the header and AES-GCM tag alone are larger than this; see src/lib/ipfs.ts).
 */
export const MIN_UPLOAD_BYTES = 32

const tooLarge = () =>
  NextResponse.json(
    { error: `Upload exceeds the ${MAX_UPLOAD_BYTES / (1024 * 1024)} MB limit` },
    { status: 413 }
  )

/**
 * Reads the request body, aborting as soon as it exceeds MAX_UPLOAD_BYTES.
 * Returns null when the cap is breached. Buffering is bounded by the cap, and
 * chunked bodies with no Content-Length are covered because the check runs on
 * bytes actually received, not on the (spoofable) header.
 */
async function readBounded(req: NextRequest): Promise<Uint8Array | null> {
  if (!req.body) return new Uint8Array(0)
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_UPLOAD_BYTES) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'
const ALLOWED_ORIGIN = process.env.NEXT_PUBLIC_APP_ORIGIN || 'http://localhost:3000'

/**
 * Pins an already-encrypted document blob to IPFS via Pinata.
 *
 * The client encrypts client-side (see src/lib/ipfs.ts) and posts the raw
 * ciphertext bytes here as the request body — this route never sees
 * plaintext. `PINATA_JWT` is a server-only env var (no `NEXT_PUBLIC_` prefix)
 * so the credential never reaches the client bundle.
 *
 * Access control: only authenticated DAO members can pin. Uses the same
 * challenge-response scheme as ourdao-backend (GET /api/auth/challenge +
 * signed header). Origin is checked as defence in depth.
 */
export async function POST(req: NextRequest) {
  const jwt = process.env.PINATA_JWT
  if (!jwt) {
    return NextResponse.json(
      { error: 'Document uploads are not configured on the server.' },
      { status: 503 }
    )
  }

  const origin = req.headers.get('origin')
  if (origin && origin !== ALLOWED_ORIGIN) {
    return NextResponse.json(
      { error: 'Invalid origin' },
      { status: 403 }
    )
  }

  const contentType = req.headers.get('content-type')
  if (contentType !== 'application/octet-stream') {
    return NextResponse.json(
      { error: 'Content-Type must be application/octet-stream' },
      { status: 400 }
    )
  }

  const declaredLength = Number(req.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BYTES) {
    return tooLarge()
  }

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }

  const signature = authHeader.slice(7)
  const address = req.headers.get('x-stellar-address')
  if (!address) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }

  // Verify signature with backend (uses same challenge-response scheme)
  const verifyRes = await fetch(`${BACKEND_URL}/api/auth/verify`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
    },
    body: JSON.stringify({ address, signature }),
    cache: 'no-store',
  })

  if (!verifyRes.ok) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }

  const verified = (await verifyRes.json()) as { valid: boolean; isMember: boolean }
  if (!verified.valid || !verified.isMember) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    )
  }

  const bodyBytes = await readBounded(req)
  if (bodyBytes === null) return tooLarge()

  if (bodyBytes.byteLength === 0) {
    return NextResponse.json({ error: 'Empty upload' }, { status: 400 })
  }
  if (bodyBytes.byteLength < MIN_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Upload must be at least ${MIN_UPLOAD_BYTES} bytes` },
      { status: 400 }
    )
  }

  // 6. Construct form data with Pinata pin metadata (no member PII or IP included)
  const form = new FormData()
  form.append('file', new Blob([bodyBytes]), 'document')

  const metadata = {
    name: `doc-${Date.now()}`,
    keyvalues: {
      uploadedAt: new Date().toISOString(),
      size: String(bodyBytes.byteLength),
    },
  }
  form.append('pinataMetadata', JSON.stringify(metadata))

  let res: Response
  try {
    res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt}` },
      body: form,
    })
  } catch {
    return NextResponse.json({ error: 'Could not reach the pinning provider' }, { status: 502 })
  }

  if (!res.ok) {
    const requestId = randomUUID()
    const detail = await res.text().catch(() => '')
    console.error(`[documents] pinning provider rejected upload (${res.status}) requestId=${requestId}`, detail)
    return NextResponse.json(
      { error: `Pinning provider rejected the upload (request ${requestId})` },
      { status: 502 }
    )
  }

  // 7. Safe response JSON parsing & shape validation
  let rawData: unknown
  try {
    rawData = await res.json()
  } catch {
    return NextResponse.json({ error: 'Invalid response from pinning provider' }, { status: 502 })
  }

  if (!rawData || typeof rawData !== 'object') {
    return NextResponse.json({ error: 'Pinning provider response missing IpfsHash' }, { status: 502 })
  }

  const { IpfsHash } = rawData as { IpfsHash?: unknown }
  if (typeof IpfsHash !== 'string' || !IpfsHash.trim()) {
    return NextResponse.json({ error: 'Pinning provider response missing IpfsHash' }, { status: 502 })
  }

  // 8. Verify returned CID format & content match against uploaded bytes
  if (!verifyIPFSHash(IpfsHash, bodyBytes)) {
    return NextResponse.json(
      { error: 'Pinning provider returned invalid or mismatched IPFS hash' },
      { status: 502 }
    )
  }

  return NextResponse.json({ hash: IpfsHash })
}
