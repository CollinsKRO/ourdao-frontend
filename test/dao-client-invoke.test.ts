// @vitest-environment node
//
// jsdom's crypto polyfill isn't compatible with @noble/ed25519's random-byte
// generation (used by Keypair.random()), so this pure-logic suite (no DOM
// interaction) opts back into the real Node environment — same reasoning as
// dao-client-sc.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Account, Keypair, StrKey } from '@stellar/stellar-sdk'

const mockGetAccount = vi.fn()
const mockPrepareTransaction = vi.fn()
const mockSendTransaction = vi.fn()
const mockGetTransaction = vi.fn()

// A structurally valid (checksummed) contract strkey — `new Contract(...)`
// validates the checksum, so an arbitrary "CAAA...AAA" string is rejected.
// Named with the `mock` prefix so vitest's vi.mock hoisting allows the
// factory below to reference it.
const mockContractId = StrKey.encodeContract(Buffer.alloc(32))

vi.mock('@/lib/stellar', () => ({
  CONTRACT_ID: mockContractId,
  NETWORK_PASSPHRASE: 'Test SDF Network ; September 2015',
  isContractConfigured: () => true,
  // TransactionPendingError carries this so a member can verify a late
  // confirmation themselves instead of being told to guess.
  getTransactionUrl: (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`,
  server: {
    getAccount: (...a: unknown[]) => mockGetAccount(...a),
    prepareTransaction: (...a: unknown[]) => mockPrepareTransaction(...a),
    sendTransaction: (...a: unknown[]) => mockSendTransaction(...a),
    getTransaction: (...a: unknown[]) => mockGetTransaction(...a),
  },
}))

// Imported after the mock so `invoke` picks up the mocked `server`.
const { invoke, InvokeError, TransactionPendingError, watchTransaction } = await import(
  '@/lib/dao-client'
)

const WALLET = Keypair.random().publicKey()
// A no-op "signer" — invoke() never inspects the signature itself, only
// that the returned XDR parses back into a Transaction.
const signXDR = async (xdr: string) => xdr

describe('invoke()', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    mockGetAccount.mockResolvedValue(new Account(WALLET, '0'))
    // Real prepareTransaction assembles auth/footprint; the unit under test
    // doesn't depend on that, so pass the built transaction through as-is.
    mockPrepareTransaction.mockImplementation(async (tx) => tx)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('PENDING: polls and resolves once the transaction succeeds', async () => {
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'hash-pending' })
    mockGetTransaction.mockResolvedValue({ status: 'SUCCESS', returnValue: undefined })

    const result = await invoke(WALLET, signXDR, 'register_member')

    expect(result.hash).toBe('hash-pending')
    expect(mockGetTransaction).toHaveBeenCalledWith('hash-pending')
  })

  it('DUPLICATE: polls the already-in-flight hash instead of treating it as an error', async () => {
    mockSendTransaction.mockResolvedValue({ status: 'DUPLICATE', hash: 'hash-dup' })
    mockGetTransaction.mockResolvedValue({ status: 'SUCCESS', returnValue: undefined })

    const result = await invoke(WALLET, signXDR, 'register_member')

    expect(result.hash).toBe('hash-dup')
  })

  it('ERROR: throws immediately (no polling) with retryable: false', async () => {
    mockSendTransaction.mockResolvedValue({
      status: 'ERROR',
      hash: 'hash-error',
      errorResult: { code: 'txFAILED' },
    })

    await expect(invoke(WALLET, signXDR, 'register_member')).rejects.toMatchObject({
      retryable: false,
    })
    expect(mockGetTransaction).not.toHaveBeenCalled()
  })

  it('TRY_AGAIN_LATER: resubmits with a fresh transaction instead of erroring on the first refusal', async () => {
    // #309: the old code threw on the first TRY_AGAIN_LATER, making the member
    // click again for a condition the client can just wait out. Nothing was
    // queued, so there is nothing to poll and nothing to double-apply.
    mockSendTransaction
      .mockResolvedValueOnce({ status: 'TRY_AGAIN_LATER', hash: 'hash-busy-1' })
      .mockResolvedValueOnce({ status: 'PENDING', hash: 'hash-busy-2' })
    mockGetTransaction.mockResolvedValue({ status: 'SUCCESS', returnValue: undefined })

    const promise = invoke(WALLET, signXDR, 'register_member')
    await vi.advanceTimersByTimeAsync(2_000)
    const result = await promise

    // The successful attempt is the one whose hash gets confirmed and returned.
    expect(result.hash).toBe('hash-busy-2')
    expect(mockGetTransaction).toHaveBeenCalledWith('hash-busy-2')
  })

  it('TRY_AGAIN_LATER: each resubmission re-reads the account for a fresh sequence number', async () => {
    // Resending the previously signed transaction would be rejected with a
    // bad-sequence error instead of being accepted once congestion clears, so
    // a retry has to rebuild from a fresh account.
    mockSendTransaction
      .mockResolvedValueOnce({ status: 'TRY_AGAIN_LATER', hash: 'h1' })
      .mockResolvedValueOnce({ status: 'PENDING', hash: 'h2' })
    mockGetTransaction.mockResolvedValue({ status: 'SUCCESS', returnValue: undefined })

    mockGetAccount
      .mockResolvedValueOnce(new Account(WALLET, '0'))
      .mockResolvedValueOnce(new Account(WALLET, '1'))

    const promise = invoke(WALLET, signXDR, 'register_member')
    await vi.advanceTimersByTimeAsync(2_000)
    await promise

    expect(mockGetAccount).toHaveBeenCalledTimes(2)
    expect(mockPrepareTransaction).toHaveBeenCalledTimes(2)
  })

  it('TRY_AGAIN_LATER: gives up after a bounded number of attempts rather than spinning', async () => {
    // Each retry costs a signature prompt. An unbounded loop against a
    // permanently saturated network would hang behind a spinner forever.
    mockSendTransaction.mockResolvedValue({ status: 'TRY_AGAIN_LATER', hash: 'hash-busy' })

    const promise = invoke(WALLET, signXDR, 'register_member')
    const settled = promise.catch((e) => e)
    await vi.advanceTimersByTimeAsync(30_000)
    const error = await settled

    expect(error).toBeInstanceOf(InvokeError)
    expect(error.retryable).toBe(true)
    expect(error.message).toMatch(/network is busy/i)
    expect(mockSendTransaction).toHaveBeenCalledTimes(3)
    // The whole point: it never touches getTransaction, so it can't have
    // spent the 30s poll budget getting here.
    expect(mockGetTransaction).not.toHaveBeenCalled()
  })

  it('NOT_FOUND past the timebound: is pending, not failed — and not retryable', async () => {
    // #309: the submission window closing is not a rejection. The transaction
    // was accepted and may still land, so this must not offer "Try again" —
    // resubmitting could double-apply a vote or a withdrawal.
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'hash-lost' })
    mockGetTransaction.mockResolvedValue({ status: 'NOT_FOUND' })

    const promise = invoke(WALLET, signXDR, 'register_member')
    // Let the poll loop run to completion — the transaction's own ~30s
    // time bound, not a hardcoded 30 iterations.
    const settled = promise.catch((e) => e)
    await vi.advanceTimersByTimeAsync(31_000)
    const error = await settled

    expect(error).toBeInstanceOf(TransactionPendingError)
    expect(error).not.toBeInstanceOf(InvokeError)
    expect(error.retryable).toBe(false)
    expect(error.hash).toBe('hash-lost')
    // Carries an explorer link so the member can verify independently instead
    // of being told to guess.
    expect(error.url).toBeTruthy()
    expect(error.message).toMatch(/do not resubmit/i)
  })

  it('FAILED: throws a terminal error distinct from the pending-timeout case', async () => {
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'hash-failed' })
    mockGetTransaction.mockResolvedValue({ status: 'FAILED' })

    const promise = invoke(WALLET, signXDR, 'register_member')
    const settled = promise.catch((e) => e)
    const error = await settled

    expect(error).toBeInstanceOf(InvokeError)
    expect(error).not.toBeInstanceOf(TransactionPendingError)
    expect(error.retryable).toBe(false)
    expect(error.message).toContain('failed on-chain')
  })

  it('resolves quickly once getTransaction stops returning NOT_FOUND, without waiting out the full deadline', async () => {
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'hash-eventually' })
    let calls = 0
    mockGetTransaction.mockImplementation(async () => {
      calls += 1
      if (calls < 3) return { status: 'NOT_FOUND' }
      return { status: 'SUCCESS', returnValue: undefined }
    })

    const promise = invoke(WALLET, signXDR, 'register_member')
    await vi.advanceTimersByTimeAsync(3_000)
    const result = await promise

    expect(result.hash).toBe('hash-eventually')
    expect(calls).toBe(3)
  })

  it('builds the transaction with an inclusion fee multiplier to survive network congestion', async () => {
    mockSendTransaction.mockResolvedValue({ status: 'PENDING', hash: 'hash-fee-test' })
    mockGetTransaction.mockResolvedValue({ status: 'SUCCESS', returnValue: undefined })

    // Capture the fee on the transaction passed to prepareTransaction
    let capturedFee: string | undefined
    mockPrepareTransaction.mockImplementation(async (tx) => {
      capturedFee = tx.fee
      return tx
    })

    await invoke(WALLET, signXDR, 'register_member')

    // BASE_FEE is 100 stroops; multiplier is 1.5, so fee should be 150.
    // Transaction.fee is a string of stroops.
    expect(capturedFee).toBe('150')
  })
})

describe('watchTransaction() — late confirmation reconciliation (#309)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('reports a transaction that confirms after its submission window closed as confirmed', async () => {
    // This is the whole point: invoke() gave up, but the transaction landed a
    // few seconds later. The member must see a success, not a permanent error.
    let calls = 0
    mockGetTransaction.mockImplementation(async () => {
      calls += 1
      if (calls < 3) return { status: 'NOT_FOUND' }
      return { status: 'SUCCESS', returnValue: undefined }
    })
    const onConfirmed = vi.fn()
    const onFailed = vi.fn()

    const watch = watchTransaction('hash-late', { onConfirmed, onFailed, timeoutMs: 60_000 })
    await vi.advanceTimersByTimeAsync(5_000)
    const outcome = await watch

    expect(outcome).toBe('confirmed')
    expect(onConfirmed).toHaveBeenCalledOnce()
    expect(onFailed).not.toHaveBeenCalled()
  })

  it('reports a late on-chain failure as failed, not as a timeout', async () => {
    mockGetTransaction.mockResolvedValue({ status: 'FAILED' })
    const onConfirmed = vi.fn()
    const onFailed = vi.fn()

    const watch = watchTransaction('hash-doomed', { onConfirmed, onFailed, timeoutMs: 60_000 })
    await vi.advanceTimersByTimeAsync(2_000)
    const outcome = await watch

    expect(outcome).toBe('failed')
    expect(onFailed).toHaveBeenCalledWith('FAILED')
    expect(onConfirmed).not.toHaveBeenCalled()
  })

  it('survives a transient RPC error and keeps polling', async () => {
    // A flaky read during background reconciliation is not a verdict on the
    // transaction; treating it as one would report a failure for a change that
    // is about to succeed.
    let calls = 0
    mockGetTransaction.mockImplementation(async () => {
      calls += 1
      if (calls === 1) throw new Error('ECONNRESET')
      return { status: 'SUCCESS', returnValue: undefined }
    })
    const onConfirmed = vi.fn()

    const watch = watchTransaction('hash-flaky', { onConfirmed, timeoutMs: 60_000 })
    await vi.advanceTimersByTimeAsync(5_000)

    expect(await watch).toBe('confirmed')
    expect(onConfirmed).toHaveBeenCalledOnce()
  })

  it('gives up honestly when nothing is decided within the watch budget', async () => {
    mockGetTransaction.mockResolvedValue({ status: 'NOT_FOUND' })
    const onConfirmed = vi.fn()
    const onFailed = vi.fn()

    const watch = watchTransaction('hash-silent', { onConfirmed, onFailed, timeoutMs: 10_000 })
    await vi.advanceTimersByTimeAsync(15_000)

    expect(await watch).toBe('timeout')
    expect(onConfirmed).not.toHaveBeenCalled()
    expect(onFailed).not.toHaveBeenCalled()
  })
})
