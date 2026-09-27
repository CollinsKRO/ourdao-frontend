import { describe, expect, it } from 'vitest'
import { verifyDownloadedContent } from '@/lib/ipfs'
import { computeIPFSCIDs } from '@/lib/ipfs-cid'

describe('IPFS content integrity', () => {
  it('accepts bytes whose UnixFS CID matches', async () => {
    const content = new TextEncoder().encode('verified document bytes')
    const cid = computeIPFSCIDs(content).cidV0

    await expect(verifyDownloadedContent(cid, content)).resolves.toBe(true)
  })

  it('rejects bytes that do not match the requested CID', async () => {
    const content = new TextEncoder().encode('original document')
    const cid = computeIPFSCIDs(content).cidV0

    await expect(verifyDownloadedContent(cid, new TextEncoder().encode('tampered document'))).resolves.toBe(false)
  })

  it('rejects a malformed content identifier', async () => {
    await expect(verifyDownloadedContent('QmInvalid', new Uint8Array())).resolves.toBe(false)
  })
})
