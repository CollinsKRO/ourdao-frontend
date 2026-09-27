import { describe, expect, it, vi } from 'vitest'
import { readAddress, readSigned, isVersionAtLeast, MIN_FREIGHTER_VERSION } from '@/lib/wallet'

describe('Issue #220 — Freighter version detection & shape normalizers', () => {
  it('normalizes bare string address response', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const res = readAddress('GABC123')
    expect(res.address).toBe('GABC123')
    expect(res.error).toBeUndefined()
    expect(res.branch).toBe('string')
    expect(infoSpy).toHaveBeenCalledWith('[info] [Wallet] readAddress branch: string')
    infoSpy.mockRestore()
  });

  it('normalizes object address response shape', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const res = readAddress({ address: 'GXYZ789' })
    expect(res.address).toBe('GXYZ789')
    expect(res.error).toBeUndefined()
    expect(res.branch).toBe('object_address')
    infoSpy.mockRestore()
  });

  it('normalizes object with error response shape for address', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = readAddress({ address: '', error: 'Access denied' })
    expect(res.address).toBe('')
    expect(res.error).toBe('Access denied')
    expect(res.branch).toBe('object_error')
    expect(warnSpy).toHaveBeenCalledWith('[warn] [Wallet] readAddress branch: object_error', { error: 'Access denied' })
    warnSpy.mockRestore()
  });

  it('normalizes bare string signed XDR response', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const res = readSigned('AAAA_SIGNED_XDR')
    expect(res.signedTxXdr).toBe('AAAA_SIGNED_XDR')
    expect(res.branch).toBe('string')
    infoSpy.mockRestore()
  });

  it('normalizes object signed XDR response', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const res = readSigned({ signedTxXdr: 'AAAA_OBJECT_XDR' })
    expect(res.signedTxXdr).toBe('AAAA_OBJECT_XDR')
    expect(res.branch).toBe('object_signed')
    infoSpy.mockRestore()
  });

  it('normalizes object with error response shape for signing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = readSigned({ error: 'User rejected signing' })
    expect(res.signedTxXdr).toBe('')
    expect(res.error).toBe('User rejected signing')
    expect(res.branch).toBe('object_error')
    warnSpy.mockRestore()
  });

  it('correctly compares version numbers against minimum version', () => {
    expect(isVersionAtLeast('2.0.0', MIN_FREIGHTER_VERSION)).toBe(true)
    expect(isVersionAtLeast('2.1.0', MIN_FREIGHTER_VERSION)).toBe(true)
    expect(isVersionAtLeast('1.9.5', MIN_FREIGHTER_VERSION)).toBe(false)
    expect(isVersionAtLeast('v2.0.1', MIN_FREIGHTER_VERSION)).toBe(true)
  });
});
