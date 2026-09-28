import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { vi } from 'vitest'
import {
  downloadFromIPFS,
  getIPFSUrl,
  uploadToIPFS,
  uploadMultipleDocuments,
  createDocumentMetadata,
  encryptData,
  decryptData,
  encryptBytes,
  decryptBytes,
  PBKDF2_ITERATIONS,
} from '@/lib/ipfs'

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return btoa(bin)
}

// Builds ciphertext in the pre-envelope formats: [0x01]?[salt:16][iv:12][ciphertext+tag]
async function legacyEncrypt(
  plaintext: string | Uint8Array,
  password: string,
  opts: { iterations: number; marker?: boolean; salt?: Uint8Array }
): Promise<Uint8Array> {
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
  )
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: opts.iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )
  const data = typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data))
  const prefix = opts.marker ? [1] : []
  const combined = new Uint8Array(prefix.length + 16 + 12 + encrypted.length)
  combined.set(prefix, 0)
  combined.set(salt, prefix.length)
  combined.set(iv, prefix.length + 16)
  combined.set(encrypted, prefix.length + 28)
  return combined
}

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: () => Promise.resolve(body), text: () => Promise.resolve('') } as Response
}

function bytesResponse(bytes: Uint8Array, ok = true, status = ok ? 200 : 500) {
  return { ok, status, arrayBuffer: () => Promise.resolve(bytes.buffer) } as unknown as Response
}

describe('encryptData / decryptData', () => {
  it('round-trips plaintext through AES-GCM with a derived key', async () => {
    const plaintext = 'the loan document contents'
    const encrypted = await encryptData(plaintext, 'a strong password')
    expect(encrypted).not.toBe(plaintext)
    expect(await decryptData(encrypted, 'a strong password')).toBe(plaintext)
  })

  it('fails to decrypt with the wrong password', async () => {
    const encrypted = await encryptData('secret', 'correct password')
    await expect(decryptData(encrypted, 'wrong password')).rejects.toThrow()
  })

  it('produces the base64 of a binary envelope with a magic, version and iteration header', async () => {
    const encrypted = await encryptData('versioned document', 'password')
    const decoded = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))
    expect(Array.from(decoded.subarray(0, 4))).toEqual([0x89, 0x4f, 0x44, 0x45])
    expect(decoded[4]).toBe(2)
    expect(new DataView(decoded.buffer).getUint32(5)).toBe(PBKDF2_ITERATIONS)
    expect(await decryptData(encrypted, 'password')).toBe('versioned document')
  })

  it('decrypts old unversioned ciphertext for backward compatibility', async () => {
    const combined = await legacyEncrypt('old document', 'pw', { iterations: 100_000 })
    expect(await decryptData(bytesToBase64(combined), 'pw')).toBe('old document')
  })

  it('decrypts old unversioned ciphertext whose salt happens to start with the v1 marker', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    salt[0] = 1
    const combined = await legacyEncrypt('unlucky salt', 'pw', { iterations: 100_000, salt })
    expect(await decryptData(bytesToBase64(combined), 'pw')).toBe('unlucky salt')
  })

  it('decrypts v1 ciphertext (0x01 marker, 600,000 iterations)', async () => {
    const combined = await legacyEncrypt('v1 document', 'pw', { iterations: 600_000, marker: true })
    expect(await decryptData(bytesToBase64(combined), 'pw')).toBe('v1 document')
  })
})

describe('encryptBytes / decryptBytes', () => {
  it('round-trips arbitrary binary bytes unchanged, adding only the fixed header and tag', async () => {
    // Bytes that are not valid UTF-8 (a PDF header followed by 0x80-0xFF runs).
    const original = new Uint8Array(1_000_000)
    for (let i = 0; i < original.length; i++) original[i] = (i * 131 + 7) % 256
    original.set([0x25, 0x50, 0x44, 0x46, 0x2d, 0xe2, 0xe3, 0xcf, 0xd3], 0)

    const envelope = await encryptBytes(original, 'pw')

    expect(envelope.length).toBe(original.length + 37 + 16)
    expect(await decryptBytes(envelope, 'pw')).toEqual(original)
  })

  it('reads documents stored in the older base64-text format', async () => {
    const plaintext = new TextEncoder().encode('stored before the binary envelope')
    const combined = await legacyEncrypt(plaintext, 'pw', { iterations: 600_000, marker: true })
    const storedBytes = new TextEncoder().encode(bytesToBase64(combined))
    expect(await decryptBytes(storedBytes, 'pw')).toEqual(plaintext)
  })

  it('rejects an envelope whose header was tampered with', async () => {
    const envelope = await encryptBytes(new Uint8Array([1, 2, 3]), 'pw')
    new DataView(envelope.buffer).setUint32(5, PBKDF2_ITERATIONS + 1)
    await expect(decryptBytes(envelope, 'pw')).rejects.toThrow()
  })

  it('rejects an envelope with an out-of-range iteration count without deriving a key', async () => {
    const envelope = await encryptBytes(new Uint8Array([1, 2, 3]), 'pw')
    new DataView(envelope.buffer).setUint32(5, 0xffffffff)
    await expect(decryptBytes(envelope, 'pw')).rejects.toThrow(/key-derivation/)
  })

  it('refuses an empty password', async () => {
    await expect(encryptBytes(new Uint8Array([1]), '')).rejects.toThrow(/password is required/)
    await expect(encryptData('x', '')).rejects.toThrow(/password is required/)
  })
})

describe('uploadToIPFS', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts the (unencrypted) file bytes to /api/documents and returns the pinned hash', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ hash: 'QmTestHash' }))
    const file = new File(['hello world'], 'doc.txt', { type: 'text/plain' })

    const result = await uploadToIPFS(file, false)

    expect(fetch).toHaveBeenCalledWith('/api/documents', expect.objectContaining({ method: 'POST' }))
    expect(result.hash).toBe('QmTestHash')
    expect(result.encrypted).toBe(false)
  })

  it('encrypts before uploading when a password is given', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ hash: 'QmEncryptedHash' }))
    const file = new File(['hello world'], 'doc.txt', { type: 'text/plain' })

    const result = await uploadToIPFS(file, true, 'a password')

    expect(result.encrypted).toBe(true)
    expect(result.hash).toBe('QmEncryptedHash')
    // The uploaded body is ciphertext, not the plaintext file content.
    const [, init] = vi.mocked(fetch).mock.calls[0]
    const uploadedText = await (init!.body as Blob).text()
    expect(uploadedText).not.toContain('hello world')
  })

  it('refuses an encrypted upload with an empty password instead of uploading plaintext', async () => {
    const file = new File(['hello world'], 'doc.txt', { type: 'text/plain' })
    const wallet = { address: 'GTEST', signMessage: vi.fn().mockResolvedValue('sig') }

    await expect(uploadToIPFS(file, true, '', wallet)).rejects.toThrow(/password is required/)
    await expect(uploadToIPFS(file, true, undefined, wallet)).rejects.toThrow(/password is required/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('throws with the server-provided error message on a non-2xx response, not a silent fallback', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      jsonResponse({ error: 'Document uploads are not configured on the server (PINATA_JWT is unset).' }, false, 503)
    )
    const file = new File(['hello'], 'doc.txt', { type: 'text/plain' })

    await expect(uploadToIPFS(file)).rejects.toThrow(/PINATA_JWT/)
  })

  it('throws when the upload route is unreachable', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('network error'))
    const file = new File(['hello'], 'doc.txt', { type: 'text/plain' })

    await expect(uploadToIPFS(file)).rejects.toThrow('network error')
  })
})

describe('createDocumentMetadata', () => {
  const file = new File(['x'], 'a.txt', { type: 'text/plain' })

  it('defaults an unencrypted document to closed, not public', () => {
    expect(createDocumentMetadata(file, 'Qm1', false).permissions).toEqual({ public: false })
  })

  it('defaults an encrypted document to closed', () => {
    expect(createDocumentMetadata(file, 'Qm1', true).permissions).toEqual({ public: false })
  })

  it('makes a document public only when the caller says so', () => {
    expect(createDocumentMetadata(file, 'Qm1', false, { public: true }).permissions).toEqual({
      public: true,
    })
  })
})

describe('uploadMultipleDocuments', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const makeFiles = () => [
    new File(['one'], 'one.txt', { type: 'text/plain' }),
    new File(['two'], 'two.txt', { type: 'text/plain' }),
  ]

  it('applies the given permissions to every uploaded document', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ hash: 'QmOne' }))
      .mockResolvedValueOnce(jsonResponse({ hash: 'QmTwo' }))
    const permissions = { public: false, allowedUsers: ['GALICE'], allowedRoles: ['admin'] }

    const docs = await uploadMultipleDocuments(makeFiles(), false, undefined, undefined, permissions)

    expect(docs.map(d => d.hash)).toEqual(['QmOne', 'QmTwo'])
    expect(docs.map(d => d.permissions)).toEqual([permissions, permissions])
  })

  it('defaults every document to closed when no permissions are given', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ hash: 'QmOne' }))
      .mockResolvedValueOnce(jsonResponse({ hash: 'QmTwo' }))

    const docs = await uploadMultipleDocuments(makeFiles())

    expect(docs.map(d => d.permissions)).toEqual([{ public: false }, { public: false }])
  })

  it('reports progress as a percentage after each file', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse({ hash: 'QmOne' }))
      .mockResolvedValueOnce(jsonResponse({ hash: 'QmTwo' }))
    const onProgress = vi.fn()

    await uploadMultipleDocuments(makeFiles(), false, undefined, onProgress)

    expect(onProgress.mock.calls.map(c => c[0])).toEqual([50, 100])
  })
})

describe('downloadFromIPFS', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches from the public gateway and returns the raw bytes when not encrypted', async () => {
    const bytes = new TextEncoder().encode('plain content')
    vi.mocked(fetch).mockResolvedValueOnce(bytesResponse(bytes))

    const result = await downloadFromIPFS('QmSomeHash', false)

    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('QmSomeHash'), expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(new TextDecoder().decode(result.content)).toBe('plain content')
    expect(result.decrypted).toBe(false)
  })

  it('decrypts the fetched bytes when encrypted and a password is given', async () => {
    const encrypted = await encryptData('secret contents', 'pw')
    const bytes = new TextEncoder().encode(encrypted)
    vi.mocked(fetch).mockResolvedValueOnce(bytesResponse(bytes))

    const result = await downloadFromIPFS('QmSomeHash', true, 'pw')

    expect(new TextDecoder().decode(result.content)).toBe('secret contents')
    expect(result.decrypted).toBe(true)
  })

  it('decrypts a binary envelope fetched from the gateway', async () => {
    const original = new Uint8Array([0xff, 0x00, 0x80, 0xfe, 0x25])
    vi.mocked(fetch).mockResolvedValueOnce(bytesResponse(await encryptBytes(original, 'pw')))

    const result = await downloadFromIPFS('QmSomeHash', true, 'pw')

    expect(result.content).toEqual(original)
    expect(result.decrypted).toBe(true)
  })

  it('throws a visible error when the gateway request fails, not a mock fallback', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(bytesResponse(new Uint8Array(), false, 404))
    await expect(downloadFromIPFS('QmMissing')).rejects.toThrow(/404/)
  })
})

describe('getIPFSUrl', () => {
  it('builds a URL against the configured gateway', () => {
    expect(getIPFSUrl('QmSomeHash')).toContain('QmSomeHash')
  })
})

describe('IPFS end-to-end binary round-trip', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('round-trips a large non-UTF8 binary file (>150 KB) through upload and download', async () => {
    // 200 KB fixture containing non-UTF-8 byte sequences (e.g., 0xFF, 0x80, 0x00)
    const originalBytes = new Uint8Array(200_000)
    for (let i = 0; i < originalBytes.length; i++) {
      originalBytes[i] = (i * 37) % 256
    }
    const file = new File([originalBytes], 'binary.dat', { type: 'application/octet-stream' })

    // Mock upload response
    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ hash: 'QmBinaryHash' }))

    const uploadResult = await uploadToIPFS(file, true, 'strong-pass')
    expect(uploadResult.hash).toBe('QmBinaryHash')

    // Extract posted ciphertext body from upload call
    const [, uploadInit] = vi.mocked(fetch).mock.calls[0]
    const uploadedBlob = uploadInit!.body as Blob
    const ciphertextBuffer = await uploadedBlob.arrayBuffer()
    const ciphertextBytes = new Uint8Array(ciphertextBuffer)

    // Mock download response returning the exact ciphertext
    vi.mocked(fetch).mockResolvedValueOnce(bytesResponse(ciphertextBytes))

    const downloadResult = await downloadFromIPFS('QmBinaryHash', true, 'strong-pass')
    expect(downloadResult.content).toEqual(originalBytes)
  })
})

