import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { WalletProvider, useWallet } from '@/lib/wallet'
import * as freighter from '@stellar/freighter-api'

const mockWatcherStop = vi.fn()

vi.mock('@stellar/freighter-api', () => ({
  isAllowed: vi.fn().mockResolvedValue(false),
  requestAccess: vi.fn(),
  getAddress: vi.fn(),
  getNetwork: vi.fn(),
  signTransaction: vi.fn(),
  isConnected: vi.fn().mockResolvedValue({ isConnected: true, version: '2.5.0' }),
  WatchWalletChanges: vi.fn().mockImplementation(function () {
    return {
      watch: vi.fn(() => ({})),
      stop: mockWatcherStop,
    }
  }),
}))

function Harness({ onRender }: { onRender: (w: ReturnType<typeof useWallet>) => void }) {
  const wallet = useWallet()
  onRender(wallet)
  return null
}

function renderProvider(queryClient: QueryClient, onRender: (w: ReturnType<typeof useWallet>) => void) {
  return render(
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <Harness onRender={onRender} />
      </WalletProvider>
    </QueryClientProvider>
  )
}

describe('Issue #218 — Wallet Watcher Visibility & State Updates', () => {
  let originalHidden: boolean

  beforeEach(() => {
    mockWatcherStop.mockClear()
    vi.mocked(freighter.WatchWalletChanges).mockClear()
    vi.mocked(freighter.isAllowed).mockResolvedValue({ isAllowed: true } as never)
    vi.mocked(freighter.getAddress).mockResolvedValue({ address: 'ACCOUNT_A' } as never)
    vi.mocked(freighter.getNetwork).mockResolvedValue({ network: 'TESTNET', networkPassphrase: 'Test SDF' } as never)
    originalHidden = document.hidden
  })

  afterEach(() => {
    Object.defineProperty(document, 'hidden', { value: originalHidden, configurable: true })
    vi.clearAllMocks()
  })

  it('pauses the watcher when document is hidden and resumes on visibility', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    let latest: ReturnType<typeof useWallet> | undefined
    renderProvider(qc, (w) => { latest = w })

    await waitFor(() => expect(latest?.address).toBe('ACCOUNT_A'))
    expect(freighter.WatchWalletChanges).toHaveBeenCalled()

    // Hide document
    Object.defineProperty(document, 'hidden', { value: true, configurable: true })
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    expect(mockWatcherStop).toHaveBeenCalled()

    // Resume document visibility
    vi.mocked(freighter.getAddress).mockResolvedValue({ address: 'ACCOUNT_SWITCHED' } as never)
    Object.defineProperty(document, 'hidden', { value: false, configurable: true })
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })

    await waitFor(() => expect(latest?.address).toBe('ACCOUNT_SWITCHED'))
  })
});
