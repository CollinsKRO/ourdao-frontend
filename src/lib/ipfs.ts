import { IPFS_GATEWAY, IPFS_GATEWAYS, IPFS_GATEWAY_TIMEOUT_MS } from '@/constants'

// PBKDF2-SHA256 iteration count for new encryptions, per current OWASP
// guidance. The count is written into every envelope header, so raising it
// later only affects new uploads — existing documents keep decrypting with
// the count they were written with.
export const PBKDF2_ITERATIONS = 600_000

// Iteration count used by the unversioned and v1 formats, which did not
// record it.
const LEGACY_PBKDF2_ITERATIONS = 100_000
const V1_PBKDF2_ITERATIONS = 600_000

// Upper bound on a header-supplied iteration count, so a crafted document
// cannot pin the viewer's CPU in key derivation.
const MAX_PBKDF2_ITERATIONS = 10_000_000

const SALT_BYTES = 16
const IV_BYTES = 12
const GCM_TAG_BYTES = 16

// Binary envelope (current format):
//   [magic:4][version:1][iterations:4, big-endian][salt:16][iv:12][ciphertext+tag]
// The magic starts with 0x89, which never occurs in base64 text, so it cannot
// be confused with the older base64-framed formats. The whole header is bound
// to the ciphertext as AES-GCM additional data.
const ENVELOPE_MAGIC = [0x89, 0x4f, 0x44, 0x45] // "\x89ODE"
const ENVELOPE_VERSION = 2
const ENVELOPE_HEADER_BYTES = ENVELOPE_MAGIC.length + 1 + 4 + SALT_BYTES + IV_BYTES

// Older formats, both stored as base64 text:
//   v1:           [0x01][salt:16][iv:12][ciphertext+tag]  (600,000 iterations)
//   unversioned:  [salt:16][iv:12][ciphertext+tag]        (100,000 iterations)
const V1_MARKER = 1

interface DecryptParams {
  salt: Uint8Array
  iv: Uint8Array
  iterations: number
  ciphertext: Uint8Array
  additionalData?: Uint8Array
}

// Helper functions for chunked Base64 encoding/decoding without stack overflow
function bytesToBase64(bytes: Uint8Array): string {
  let binString = ''
  for (let i = 0; i < bytes.byteLength; i += 8192) {
    binString += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(binString)
}

function base64ToBytes(base64: string): Uint8Array {
  const binString = atob(base64)
  const bytes = new Uint8Array(binString.length)
  for (let i = 0; i < binString.length; i++) {
    bytes[i] = binString.charCodeAt(i)
  }
  return bytes
}

// Convert bytes back to string using 8-bit character codes
function bytesToString(bytes: Uint8Array): string {
  let str = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    str += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return str
}

function assertPassword(password: string | undefined): asserts password is string {
  if (!password) {
    throw new Error('A password is required to encrypt or decrypt a document')
  }
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  )

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as unknown as BufferSource,
      iterations,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

function hasEnvelopeMagic(bytes: Uint8Array): boolean {
  return ENVELOPE_MAGIC.every((b, i) => bytes[i] === b)
}

function parseEnvelope(bytes: Uint8Array): DecryptParams {
  if (bytes.length < ENVELOPE_HEADER_BYTES + GCM_TAG_BYTES) {
    throw new Error('Encrypted document is truncated')
  }
  const version = bytes[ENVELOPE_MAGIC.length]
  if (version !== ENVELOPE_VERSION) {
    throw new Error(`Unsupported encrypted document version ${version}`)
  }
  const iterOffset = ENVELOPE_MAGIC.length + 1
  const iterations = new DataView(bytes.buffer, bytes.byteOffset + iterOffset, 4).getUint32(0)
  if (iterations < LEGACY_PBKDF2_ITERATIONS || iterations > MAX_PBKDF2_ITERATIONS) {
    throw new Error('Encrypted document has an invalid key-derivation parameter')
  }
  const saltOffset = iterOffset + 4
  const ivOffset = saltOffset + SALT_BYTES
  return {
    iterations,
    salt: bytes.slice(saltOffset, ivOffset),
    iv: bytes.slice(ivOffset, ENVELOPE_HEADER_BYTES),
    ciphertext: bytes.slice(ENVELOPE_HEADER_BYTES),
    additionalData: bytes.slice(0, ENVELOPE_HEADER_BYTES),
  }
}

// The v1 marker byte is indistinguishable from an unversioned payload whose
// random salt happens to start with 0x01, so both readings are returned and
// tried in order; AES-GCM authentication rejects the wrong one.
function parseLegacy(combined: Uint8Array): DecryptParams[] {
  const candidates: DecryptParams[] = []
  if (combined[0] === V1_MARKER && combined.length >= 1 + SALT_BYTES + IV_BYTES + GCM_TAG_BYTES) {
    candidates.push({
      iterations: V1_PBKDF2_ITERATIONS,
      salt: combined.slice(1, 1 + SALT_BYTES),
      iv: combined.slice(1 + SALT_BYTES, 1 + SALT_BYTES + IV_BYTES),
      ciphertext: combined.slice(1 + SALT_BYTES + IV_BYTES),
    })
  }
  if (combined.length >= SALT_BYTES + IV_BYTES + GCM_TAG_BYTES) {
    candidates.push({
      iterations: LEGACY_PBKDF2_ITERATIONS,
      salt: combined.slice(0, SALT_BYTES),
      iv: combined.slice(SALT_BYTES, SALT_BYTES + IV_BYTES),
      ciphertext: combined.slice(SALT_BYTES + IV_BYTES),
    })
  }
  if (candidates.length === 0) {
    throw new Error('Encrypted document is truncated')
  }
  return candidates
}

async function decryptWith(candidates: DecryptParams[], password: string): Promise<Uint8Array> {
  let lastError: unknown
  for (const { salt, iv, iterations, ciphertext, additionalData } of candidates) {
    try {
      const key = await deriveKey(password, salt, iterations)
      const decrypted = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv as unknown as BufferSource,
          ...(additionalData && { additionalData: additionalData as unknown as BufferSource }),
        },
        key,
        ciphertext as unknown as BufferSource
      )
      return new Uint8Array(decrypted)
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

/**
 * Encrypts arbitrary bytes into the binary envelope. Throws on an empty
 * password rather than returning anything that could be mistaken for
 * ciphertext.
 */
export async function encryptBytes(data: Uint8Array, password: string): Promise<Uint8Array> {
  assertPassword(password)

  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))

  const header = new Uint8Array(ENVELOPE_HEADER_BYTES)
  header.set(ENVELOPE_MAGIC, 0)
  header[ENVELOPE_MAGIC.length] = ENVELOPE_VERSION
  new DataView(header.buffer).setUint32(ENVELOPE_MAGIC.length + 1, PBKDF2_ITERATIONS)
  header.set(salt, ENVELOPE_MAGIC.length + 5)
  header.set(iv, ENVELOPE_MAGIC.length + 5 + SALT_BYTES)

  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS)
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: header },
    key,
    data as unknown as BufferSource
  )

  const envelope = new Uint8Array(header.length + encrypted.byteLength)
  envelope.set(header, 0)
  envelope.set(new Uint8Array(encrypted), header.length)
  return envelope
}

/**
 * Decrypts a stored document: either the binary envelope, or the older
 * base64-text formats (v1 and unversioned) that earlier uploads produced.
 */
export async function decryptBytes(stored: Uint8Array, password: string): Promise<Uint8Array> {
  assertPassword(password)
  if (hasEnvelopeMagic(stored)) {
    return decryptWith([parseEnvelope(stored)], password)
  }
  let combined: Uint8Array
  try {
    combined = base64ToBytes(bytesToString(stored).trim())
  } catch {
    throw new Error('Unrecognized encrypted document format')
  }
  return decryptWith(parseLegacy(combined), password)
}

// Encryption utilities for string data. The result is the binary envelope,
// base64-encoded so it can travel as text.
export async function encryptData(data: string, password: string): Promise<string> {
  return bytesToBase64(await encryptBytes(new TextEncoder().encode(data), password))
}

export async function decryptData(encryptedData: string, password: string): Promise<string> {
  assertPassword(password)
  const combined = base64ToBytes(encryptedData)
  const candidates = hasEnvelopeMagic(combined) ? [parseEnvelope(combined)] : parseLegacy(combined)
  return new TextDecoder().decode(await decryptWith(candidates, password))
}

// IPFS upload with encryption. Encryption happens here, client-side, before
// anything leaves the browser — the server route this posts to only ever
// sees the resulting ciphertext, never the plaintext file.
export async function uploadToIPFS(
  file: File,
  encrypt: boolean = false,
  password?: string,
  wallet?: { address: string; signMessage: (message: string) => Promise<string> }
): Promise<{ hash: string; size: number; encrypted: boolean }> {
  // An encrypted upload with no password must fail, never fall through to
  // pinning the plaintext on public IPFS.
  if (encrypt) assertPassword(password)

  const fileContent = new Uint8Array(await file.arrayBuffer())
  const processedData = encrypt ? await encryptBytes(fileContent, password!) : fileContent

  if (!wallet?.address || !wallet?.signMessage) {
    throw new Error('Wallet not connected')
  }

  // Get challenge from backend
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:4000'
  const challengeRes = await fetch(`${backendUrl}/api/auth/challenge?address=${encodeURIComponent(wallet.address)}`, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  })

  if (!challengeRes.ok) {
    throw new Error('Could not get authentication challenge')
  }

  const { challenge } = (await challengeRes.json()) as { challenge: string }

  // Sign challenge with wallet
  const signature = await wallet.signMessage(challenge)

  // TS's Uint8Array is generic over its buffer type as of TS 5.7+; BlobPart
  // requires an ArrayBuffer-backed one specifically, so copy into a fresh
  // Uint8Array to satisfy that (no behavior change) — same fix as
  // DocumentViewer.tsx's preview blob.
  const res = await fetch('/api/documents', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${signature}`,
      'x-stellar-address': wallet.address,
    },
    body: new Blob([new Uint8Array(processedData)], { type: 'application/octet-stream' }),
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error || `Document upload failed (${res.status})`)
  }

  const { hash } = (await res.json()) as { hash: string }

  return {
    hash,
    size: processedData.length,
    encrypted: encrypt,
  }
}

// Public gateways rate-limit, go down and stall, so each configured gateway is
// tried in order with a timeout; a timeout, network error or non-2xx response
// moves on to the next one instead of hanging DocumentViewer.
async function fetchFromGateways(hash: string): Promise<Response> {
  let lastError: Error | undefined
  for (const gateway of IPFS_GATEWAYS) {
    try {
      const res = await fetch(`${gateway}${hash}`, {
        signal: AbortSignal.timeout(IPFS_GATEWAY_TIMEOUT_MS),
      })
      if (res.ok) return res
      lastError = new Error(`Failed to fetch document from IPFS gateway (${res.status})`)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastError ?? new Error('No IPFS gateway configured')
}

// IPFS download with decryption, read straight from the public gateway — no
// credential needed for reads.
export async function downloadFromIPFS(
  hash: string,
  encrypted: boolean = false,
  password?: string
): Promise<{ content: Uint8Array; decrypted: boolean }> {
  const res = await fetchFromGateways(hash)
  const fileData = new Uint8Array(await res.arrayBuffer())

  if (encrypted && password) {
    const content = await decryptBytes(fileData, password)
    return {
      content,
      decrypted: true,
    }
  }

  return {
    content: fileData,
    decrypted: false,
  }
}

// Get IPFS URL for direct access
export function getIPFSUrl(hash: string): string {
  return `${IPFS_GATEWAY}${hash}`
}

// Validate IPFS hash. Not yet called by getIPFSUrl or downloadFromIPFS, so a
// malformed hash still flows straight into the gateway URL.
export function validateIPFSHash(hash: string): boolean {
  // Shape check only — validates format but not cryptographic integrity.
  // CIDv0: Qm followed by 44 base58btc chars (46 total)
  const cidV0Regex = /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/

  // CIDv1: multibase prefix + variable-length hash
  // Supports common prefixes: b (base32), B (base32upper), f (base16), z (base58btc)
  // Accepts 7-60 chars after prefix to cover common multihash lengths
  const cidV1Regex = /^[bBfz][0-9A-Za-z]{7,60}$/

  return cidV0Regex.test(hash) || cidV1Regex.test(hash)
}

// Generate document metadata
export interface DocumentMetadata {
  name: string
  type: string
  size: number
  uploadedAt: Date
  encrypted: boolean
  hash: string
  tags?: string[]
  permissions?: {
    public: boolean
    allowedUsers?: string[]
    allowedRoles?: string[]
  }
}

export function createDocumentMetadata(
  file: File,
  hash: string,
  encrypted: boolean,
  permissions?: DocumentMetadata['permissions']
): DocumentMetadata {
  return {
    name: file.name,
    type: file.type,
    size: file.size,
    uploadedAt: new Date(),
    encrypted,
    hash,
    // Closed unless the caller says otherwise: encryption and public access are
    // separate decisions, so not encrypting must never imply "anyone may read".
    permissions: permissions || { public: false }
  }
}

// Document access control
export function canAccessDocument(
  metadata: DocumentMetadata,
  userAddress: string,
  userRoles: string[] = []
): boolean {
  if (metadata.permissions?.public) {
    return true
  }

  // Stellar public keys are uppercase base32 (G… / C…, 56 chars).
  // Do NOT lowercase — the canonical form is all-caps and lowercasing the
  // needle means it can never match an address stored in canonical form.
  // Compare both sides as-is; callers are responsible for passing the address
  // in the same form it was stored (canonical uppercase for Stellar).
  if (metadata.permissions?.allowedUsers?.includes(userAddress)) {
    return true
  }
  
  if (metadata.permissions?.allowedRoles?.some(role => userRoles.includes(role))) {
    return true
  }
  
  return false
}

// Batch upload multiple documents
export async function uploadMultipleDocuments(
  files: File[],
  encrypt: boolean = false,
  password?: string,
  onProgress?: (progress: number) => void,
  wallet?: { address: string; signMessage: (message: string) => Promise<string> }
): Promise<DocumentMetadata[]> {
  const results: DocumentMetadata[] = []
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const uploadResult = await uploadToIPFS(file, encrypt, password, wallet)
    const metadata = createDocumentMetadata(file, uploadResult.hash, encrypt)
    results.push(metadata)
    
    if (onProgress) {
      onProgress((i + 1) / files.length * 100)
    }
  }
  
  return results
}

// Document search and filtering
export interface DocumentFilter {
  type?: string
  encrypted?: boolean
  tags?: string[]
  dateFrom?: Date
  dateTo?: Date
  sizeMin?: number
  sizeMax?: number
}

export function filterDocuments(
  documents: DocumentMetadata[],
  filter: DocumentFilter
): DocumentMetadata[] {
  return documents.filter(doc => {
    if (filter.type && doc.type !== filter.type) return false
    if (filter.encrypted !== undefined && doc.encrypted !== filter.encrypted) return false
    if (filter.tags && !filter.tags.some(tag => doc.tags?.includes(tag))) return false
    if (filter.dateFrom && doc.uploadedAt < filter.dateFrom) return false
    if (filter.dateTo && doc.uploadedAt > filter.dateTo) return false
    if (filter.sizeMin !== undefined && doc.size < filter.sizeMin) return false
    if (filter.sizeMax !== undefined && doc.size > filter.sizeMax) return false
    return true
  })
}
