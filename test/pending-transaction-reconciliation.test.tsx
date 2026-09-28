// @vitest-environment jsdom
//
// #309 — a transaction whose submission window closes without a confirmation
// must not be reported as a failure. The write may still land, so the member is
// told to wait (with a hash and a link), the UI keeps the optimistic state
// rather than rolling it back, and a background reconciliation upgrades the
// outcome to confirmed if the transaction does land.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useMemberRegistration, useWriteAction } from '@/hooks/dao/writes'
// The mocked classes, so the test constructs the exact identity that
// useWriteAction's `instanceof` check compares against.
const { InvokeError, TransactionPendingError } = await import('@/lib/dao-client')

const mockRegisterMember = vi.fn()
// Typed to the react-hot-toast call shape so the arguments are accepted
// without naming unused parameters.
type ToastFn = (message: unknown, options?: unknown) => string
const mockToastLoading = vi.fn<ToastFn>(() => 'toast-1')
const mockToastSuccess = vi.fn<ToastFn>(() => 'toast-1')
const mockToastError = vi.fn<ToastFn>(() => 'toast-1')
const mockToast = vi.fn<ToastFn>(() => 'toast-1')
const mockAnnounce = vi.fn()
const mockWatchTransaction = vi.fn<(...a: unknown[]) => Promise<string>>()

// Declared inside the mock factories below, because `vi.mock` is hoisted above
// these statements and cannot close over top-level bindings. The real classes
// are mirrored closely enough that `instanceof` in useWriteAction behaves as it
// does in production.
vi.mock('@/lib/wallet', () => ({
  useWallet: () => ({ address: 'GALICE', isConnected: true, signXDR: vi.fn() }),
}))

vi.mock('@/lib/dao-client', () => ({
  daoWrite: () => ({ registerMember: () => mockRegisterMember() }),
  InvokeError: class InvokeError extends Error {
    retryable: boolean
    constructor(message: string, opts: { retryable?: boolean } = {}) {
      super(message)
      this.retryable = opts.retryable ?? false
    }
  },
  // A submission window that closed without a confirmation is a distinct,
  // non-retryable outcome (#309) — useWriteAction branches on it.
  TransactionPendingError: class TransactionPendingError extends Error {
    hash = 'hash-late'
    url: string | null = 'https://stellar.expert/explorer/testnet/tx/hash-late'
    retryable = false
  },
  watchTransaction: (hash: string, handlers?: unknown) => mockWatchTransaction(hash, handlers),
}))

vi.mock('@/lib/stellar', () => ({
  getTransactionUrl: (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`,
}))

vi.mock('@/lib/announce', () => ({
  announce: (...a: unknown[]) => mockAnnounce(...a),
}))

vi.mock('react-hot-toast', () => ({
  default: Object.assign(
    // Wrapped rather than referenced directly: `vi.mock` is hoisted above the
    // `const` declarations, so the factory may only touch them at call time.
    (...a: Parameters<ToastFn>) => mockToast(...a),
    {
      loading: (...a: Parameters<ToastFn>) => mockToastLoading(...a),
      success: (...a: Parameters<ToastFn>) => mockToastSuccess(...a),
      error: (...a: Parameters<ToastFn>) => mockToastError(...a),
      dismiss: vi.fn(),
    }
  ),
}))

function HarnessRaw({ onRender }: { onRender: (h: ReturnType<typeof useWriteAction>) => void }) {
  const hook = useWriteAction()
  onRender(hook)
  return null
}

function Harness({ onRender }: { onRender: (h: ReturnType<typeof useMemberRegistration>) => void }) {
  const hook = useMemberRegistration()
  onRender(hook)
  return null
}

function renderHook() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const invalidateSpy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue()
  let latest: ReturnType<typeof useMemberRegistration> | undefined
  render(
    <QueryClientProvider client={client}>
      <Harness onRender={(h) => { latest = h }} />
    </QueryClientProvider>
  )
  return { latest: () => latest!, invalidateSpy }
}

describe('useWriteAction late confirmation (#309)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWatchTransaction.mockResolvedValue('timeout')
    mockRegisterMember.mockRejectedValue(new TransactionPendingError('hash-late', 'https://example/tx'))
  })
  afterEach(() => vi.clearAllMocks())

  it('surfaces a pending transaction as pending, not as a failure', async () => {
    const { latest } = renderHook()

    await act(async () => {
      await latest().registerMember().catch(() => {})
    })

    expect(mockToastError).not.toHaveBeenCalled()
    // The member is told to wait, with the explorer link in the toast body.
    expect(mockToast).toHaveBeenCalled()
    const [body] = mockToast.mock.calls[0] as [React.ReactNode]
    expect(JSON.stringify(body)).toContain('do not resubmit')
  })

  it('does not offer a retry for a transaction that may still be in flight', async () => {
    // A retry here could double-apply a vote or a withdrawal, so the
    // "Try again" affordance must stay off.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    vi.spyOn(client, 'invalidateQueries').mockResolvedValue()
    let latest: ReturnType<typeof useWriteAction> | undefined
    render(
      <QueryClientProvider client={client}>
        <HarnessRaw onRender={(h) => { latest = h }} />
      </QueryClientProvider>
    )

    await act(async () => {
      await latest!.run('Casting vote', () => Promise.reject(new TransactionPendingError('hash-late', 'https://example/tx'))).catch(() => {})
    })

    expect(latest!.isRetryable).toBe(false)
    expect(latest!.error).toBeInstanceOf(TransactionPendingError)
  })

  it('announces politely that the transaction is still confirming', async () => {
    const { latest } = renderHook()

    await act(async () => {
      await latest().registerMember().catch(() => {})
    })

    const calls = mockAnnounce.mock.calls as unknown[][]
    const last = calls[calls.length - 1]
    expect(last[0]).toMatch(/still confirming/i)
    // Polite, not assertive: nothing is wrong, and the member may be reading.
    expect(last[1]).toBe('polite')
  })

  it('starts a background watch keyed on the transaction hash', async () => {
    const { latest } = renderHook()

    await act(async () => {
      await latest().registerMember().catch(() => {})
    })

    expect(mockWatchTransaction).toHaveBeenCalledOnce()
    expect((mockWatchTransaction.mock.calls[0] as unknown[])[0]).toBe('hash-late')
  })

  it('upgrades to confirmed and refetches when the transaction lands late', async () => {
    const { latest, invalidateSpy } = renderHook()

    await act(async () => {
      await latest().registerMember().catch(() => {})
    })

    // Drive the reconciliation callback the way a late confirmation would.
    const handlers = mockWatchTransaction.mock.calls[0][1] as {
      onConfirmed?: () => void
    }
    expect(typeof handlers?.onConfirmed).toBe('function')

    await act(async () => {
      await handlers!.onConfirmed!()
    })

    // The same keys a confirmed write would have refetched, so the UI
    // reflects the on-chain state rather than staying stale.
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['userData', 'GALICE'] })
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['daoStats'] })
    expect(mockToastSuccess).toHaveBeenCalled()
  })

  it('reports a terminal on-chain failure if the late transaction does fail', async () => {
    const { latest } = renderHook()

    await act(async () => {
      await latest().registerMember().catch(() => {})
    })

    const handlers = mockWatchTransaction.mock.calls[0][1] as {
      onFailed?: (status: string) => void
    }
    await act(async () => {
      handlers!.onFailed!('FAILED')
    })

    expect(mockToastError).toHaveBeenCalled()
    expect(mockToastError.mock.calls.at(-1)?.[0]).toMatch(/failed on-chain/i)
  })

  it('still rolls back optimistic state for an ordinary failure', async () => {
    mockRegisterMember.mockRejectedValue(new InvokeError('NotEligible', { retryable: false }))

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    client.setQueryData(['userData', 'GALICE'], { isMember: false })
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries').mockResolvedValue()
    let latest: ReturnType<typeof useMemberRegistration> | undefined
    render(
      <QueryClientProvider client={client}>
        <Harness onRender={(h) => { latest = h }} />
      </QueryClientProvider>
    )

    await act(async () => {
      await latest!.registerMember().catch(() => {})
    })

    // A rejected write must not start a background watch, and must not
    // invalidate as if it had landed.
    expect(mockWatchTransaction).not.toHaveBeenCalled()
    expect(invalidateSpy).not.toHaveBeenCalled()
    expect(mockToastError).toHaveBeenCalled()
  })
})
