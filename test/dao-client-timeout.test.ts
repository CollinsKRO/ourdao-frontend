import { describe, expect, it } from 'vitest'
import { READ_TIMEOUT_MS, WRITE_TIMEOUT_MS, withTimeout } from '@/lib/dao-client'

describe('dao-client timeout utilities', () => {
  it('withTimeout resolves when the promise resolves before timeout', async () => {
    const result = await withTimeout(Promise.resolve('success'), 1000, 'test')
    expect(result).toBe('success')
  })

  it('withTimeout rejects with retryable error when promise times out', async () => {
    const slowPromise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('slow'), 2000)
    })

    const promise = withTimeout(slowPromise, 100, 'test operation')

    await expect(promise).rejects.toThrow('test operation timed out after 100ms')
    try {
      await promise
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      expect((e as Error & { retryable: boolean }).retryable).toBe(true)
    }
  })

  it('withTimeout preserves original error when promise rejects before timeout', async () => {
    const error = new Error('original error')
    const rejectingPromise = Promise.reject(error)

    await expect(withTimeout(rejectingPromise, 1000, 'test')).rejects.toThrow('original error')
  })

  it('READ_TIMEOUT_MS and WRITE_TIMEOUT_MS are exported and have reasonable values', () => {
    expect(READ_TIMEOUT_MS).toBe(10_000)
    expect(WRITE_TIMEOUT_MS).toBe(60_000)
    expect(WRITE_TIMEOUT_MS).toBeGreaterThan(READ_TIMEOUT_MS)
  })

  it('timeout error is retryable', async () => {
    const slowPromise = new Promise<string>((resolve) => {
      setTimeout(() => resolve('slow'), 2000)
    })

    try {
      await withTimeout(slowPromise, 50, 'test')
    } catch (e) {
      expect(e).toBeInstanceOf(Error)
      expect((e as Error & { retryable: boolean }).retryable).toBe(true)
    }
  })
})
