import { describe, expect, it, vi } from 'vitest'
import { createQueryClient } from '@/components/providers'
import { allWalletScopedQueryKeys, queryKeys } from '@/lib/query-keys'
import { QUERY_REFRESH_INTERVAL_MS, QUERY_STALE_TIME_MS } from '@/constants'

describe('query policy', () => {
  it('uses one explicit freshness policy without automatic retries', () => {
    const client = createQueryClient()
    const options = client.getDefaultOptions().queries!

    expect(options.staleTime).toBe(QUERY_STALE_TIME_MS)
    expect(QUERY_REFRESH_INTERVAL_MS).toBe(60_000)
    expect(options.refetchOnWindowFocus).toBe(true)
    expect(options.retry).toBe(0)
  })

  it('routes query failures through the central cache handler', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const client = createQueryClient()

    await expect(
      client.fetchQuery({
        queryKey: ['policy-test'],
        queryFn: () => Promise.reject(new Error('deterministic contract error')),
      })
    ).rejects.toThrow('deterministic contract error')

    expect(errorSpy).toHaveBeenCalledWith(
      'Query failed',
      expect.objectContaining({ queryKey: ['policy-test'] })
    )
    errorSpy.mockRestore()
  })
})

describe('query key factory', () => {
  it('requires an address for wallet-scoped keys and enumerates all scopes', () => {
    expect(queryKeys.userData('GALICE')).toEqual(['userData', 'GALICE'])
    expect(queryKeys.document('cid', 'GALICE')).toEqual(['document', 'cid', 'GALICE'])
    expect(allWalletScopedQueryKeys()).toEqual([
      ['userData'],
      ['userLoans'],
      ['hasVoted'],
      ['stake'],
      ['document'],
      ['notifications'],
    ])
  })
})