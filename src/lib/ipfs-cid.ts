import { createHash } from 'node:crypto'
import { validateIPFSHash } from './ipfs'

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

function encodeBase58(buffer: Uint8Array): string {
  const digits: number[] = [0]
  for (let i = 0; i < buffer.length; i++) {
    for (let j = 0; j < digits.length; j++) {
      digits[j] <<= 8
    }
    digits[0] += buffer[i]
    let carry = 0
    for (let j = 0; j < digits.length; j++) {
      digits[j] += carry
      carry = (digits[j] / 58) | 0
      digits[j] %= 58
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  for (let i = 0; i < buffer.length && buffer[i] === 0; i++) {
    digits.push(0)
  }
  return digits
    .reverse()
    .map((d) => BASE58_ALPHABET[d])
    .join('')
}

function encodeBase32(buffer: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = 'b'
  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i]
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

function encodeVarint(n: number): Uint8Array {
  const bytes: number[] = []
  let val = n
  while (val >= 0x80) {
    bytes.push((val & 0x7f) | 0x80)
    val >>>= 7
  }
  bytes.push(val & 0x7f)
  return new Uint8Array(bytes)
}

function concatBuffers(...bufs: Uint8Array[]): Uint8Array {
  const totalLen = bufs.reduce((sum, b) => sum + b.length, 0)
  const out = new Uint8Array(totalLen)
  let offset = 0
  for (const b of bufs) {
    out.set(b, offset)
    offset += b.length
  }
  return out
}

export interface ComputedCIDs {
  cidV0: string
  cidV1DagPb: string
  cidV1Raw: string
}

/**
 * Computes possible IPFS CIDs (CIDv0 UnixFS, CIDv1 UnixFS dag-pb, and CIDv1 raw)
 * for a given byte payload server-side using SHA-256.
 */
export function computeIPFSCIDs(content: Uint8Array): ComputedCIDs {
  const lenVarint = encodeVarint(content.length)
  
  // UnixFS PB node encoding for file content
  const dataPb = concatBuffers(
    new Uint8Array([0x08, 0x02, 0x12]),
    lenVarint,
    content,
    new Uint8Array([0x18]),
    lenVarint
  )
  
  const dataPbLenVarint = encodeVarint(dataPb.length)
  const outerPb = concatBuffers(
    new Uint8Array([0x0a]),
    dataPbLenVarint,
    dataPb
  )
  
  const unixfsDigest = createHash('sha256').update(outerPb).digest()
  const unixfsMultihash = concatBuffers(new Uint8Array([0x12, 0x20]), unixfsDigest)
  
  const cidV0 = encodeBase58(unixfsMultihash)
  
  const cidv1DagPbBytes = concatBuffers(new Uint8Array([0x01, 0x70]), unixfsMultihash)
  const cidV1DagPb = encodeBase32(cidv1DagPbBytes)
  
  const rawDigest = createHash('sha256').update(content).digest()
  const rawMultihash = concatBuffers(new Uint8Array([0x12, 0x20]), rawDigest)
  const cidv1RawBytes = concatBuffers(new Uint8Array([0x01, 0x55]), rawMultihash)
  const cidV1Raw = encodeBase32(cidv1RawBytes)
  
  return { cidV0, cidV1DagPb, cidV1Raw }
}

/**
 * Verifies that a returned IPFS hash has a valid CID shape and matches
 * the uploaded bytes (checking against UnixFS CIDv0, UnixFS CIDv1, and raw CIDv1).
 */
export function verifyIPFSHash(returnedHash: string, content: Uint8Array): boolean {
  if (!returnedHash || typeof returnedHash !== 'string') return false
  if (!validateIPFSHash(returnedHash)) return false

  const computed = computeIPFSCIDs(content)
  const lowerReturned = returnedHash.toLowerCase()

  return (
    returnedHash === computed.cidV0 ||
    lowerReturned === computed.cidV1DagPb.toLowerCase() ||
    lowerReturned === computed.cidV1Raw.toLowerCase()
  )
}
