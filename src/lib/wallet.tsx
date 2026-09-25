'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  isAllowed,
  requestAccess,
  getAddress,
  getNetwork,
  signTransaction,
  WatchWalletChanges,
  isConnected as checkFreighterConnected,
} from '@stellar/freighter-api'
import { Networks } from '@stellar/stellar-sdk'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { NETWORK_PASSPHRASE } from './stellar'

export const MIN_FREIGHTER_VERSION = '2.0.0'

export function isVersionAtLeast(version: string, minVersion: string): boolean {
  const vParts = version.replace(/^v/i, '').split('.').map(Number)
  const minParts = minVersion.replace(/^v/i, '').split('.').map(Number)
  for (let i = 0; i < Math.max(vParts.length, minParts.length); i++) {
    const v = vParts[i] || 0
    const m = minParts[i] || 0
    if (v > m) return true
    if (v < m) return false
  }
  return true
}

interface WalletContextValue {
  address: string | null
  isConnected: boolean
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => void
  /** Signs a base64 transaction XDR with Freighter and returns the signed XDR. */
  signXDR: (xdr: string, options?: { timeoutMs?: number; signal?: AbortSignal }) => Promise<string>
  /** True when the connected Freighter wallet's active network differs from this app's configured NETWORK_PASSPHRASE. */
  networkMismatch: boolean
  /** Freighter's own network label (e.g. "PUBLIC", "TESTNET"), null until known. */
  walletNetwork: string | null
  /** Detected version of the installed Freighter extension, or null if unknown/not installed. */
  freighterVersion: string | null
  /** True if the detected Freighter version meets or exceeds MIN_FREIGHTER_VERSION. */
  isVersionSupported: boolean
}

const WalletContext = createContext<WalletContextValue | undefined>(undefined)

// Freighter's API has shifted return shapes across versions (bare string vs.
// `{ address }` vs. `{ address, error }`). These normalize both worlds.
export function readAddress(res: unknown): { address: string; error?: string; branch: 'string' | 'object_address' | 'object_error' | 'unknown' } {
  if (typeof res === 'string') {
    console.info('[Wallet] readAddress branch: string')
    return { address: res, branch: 'string' }
  }
  const r = (res || {}) as { address?: string; error?: unknown }
  if (r.error) {
    console.warn(`[Wallet] readAddress branch: object_error - ${String(r.error)}`)
    return { address: r.address || '', error: String(r.error), branch: 'object_error' }
  }
  if (typeof r.address === 'string') {
    console.info('[Wallet] readAddress branch: object_address')
    return { address: r.address, branch: 'object_address' }
  }
  console.warn('[Wallet] readAddress branch: unknown response shape', res)
  return { address: '', branch: 'unknown' }
}

export function readSigned(res: unknown): { signedTxXdr: string; error?: string; branch: 'string' | 'object_signed' | 'object_error' | 'unknown' } {
  if (typeof res === 'string') {
    console.info('[Wallet] readSigned branch: string')
    return { signedTxXdr: res, branch: 'string' }
  }
  const r = (res || {}) as { signedTxXdr?: string; error?: unknown }
  if (r.error) {
    console.warn(`[Wallet] readSigned branch: object_error - ${String(r.error)}`)
    return { signedTxXdr: r.signedTxXdr || '', error: String(r.error), branch: 'object_error' }
  }
  if (typeof r.signedTxXdr === 'string') {
    console.info('[Wallet] readSigned branch: object_signed')
    return { signedTxXdr: r.signedTxXdr, branch: 'object_signed' }
  }
  console.warn('[Wallet] readSigned branch: unknown response shape', res)
  return { signedTxXdr: '', branch: 'unknown' }
}

/** Friendly label for a network passphrase, for the mismatch banner. */
function passphraseLabel(passphrase: string): string {
  switch (passphrase) {
    case Networks.PUBLIC:
      return 'Mainnet'
    case Networks.TESTNET:
      return 'Testnet'
    case Networks.FUTURENET:
      return 'Futurenet'
    default:
      return passphrase
  }
}

// Poll interval for Freighter's own watcher (address/network changes aren't
// pushed as DOM events — this is the API's own polling mechanism).
const WALLET_WATCH_INTERVAL_MS = 2000
const DEFAULT_SIGN_TIMEOUT_MS = 60000

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [walletNetworkPassphrase, setWalletNetworkPassphrase] = useState<string | null>(null)
  const [walletNetwork, setWalletNetwork] = useState<string | null>(null)
  const [freighterVersion, setFreighterVersion] = useState<string | null>(null)
  const [isVersionSupported, setIsVersionSupported] = useState<boolean>(true)

  const queryClient = useQueryClient()

  const addressRef = useRef<string | null>(null)
  const walletNetworkPassphraseRef = useRef<string | null>(null)
  const walletNetworkRef = useRef<string | null>(null)

  useEffect(() => {
    addressRef.current = address
  }, [address])

  useEffect(() => {
    walletNetworkPassphraseRef.current = walletNetworkPassphrase
  }, [walletNetworkPassphrase])

  useEffect(() => {
    walletNetworkRef.current = walletNetwork
  }, [walletNetwork])

  const checkVersion = useCallback(async () => {
    try {
      if (
        typeof window !== 'undefined' &&
        (window as unknown as { freighter?: { getFreighterVersion?: () => Promise<string> } }).freighter?.getFreighterVersion
      ) {
        const ver = await (
          window as unknown as { freighter: { getFreighterVersion: () => Promise<string> } }
        ).freighter.getFreighterVersion()
        if (ver) {
          setFreighterVersion(ver)
          const supported = isVersionAtLeast(ver, MIN_FREIGHTER_VERSION)
          setIsVersionSupported(supported)
          if (!supported) {
            console.warn(`[Wallet] Freighter version ${ver} is below minimum supported version ${MIN_FREIGHTER_VERSION}`)
          }
          return ver
        }
      }
      const connInfo = await checkFreighterConnected()
      const ver =
        typeof connInfo === 'object' && connInfo && 'version' in connInfo
          ? String((connInfo as { version?: unknown }).version || '')
          : null
      if (ver) {
        setFreighterVersion(ver)
        const supported = isVersionAtLeast(ver, MIN_FREIGHTER_VERSION)
        setIsVersionSupported(supported)
        if (!supported) {
          console.warn(`[Wallet] Freighter version ${ver} is below minimum supported version ${MIN_FREIGHTER_VERSION}`)
        }
        return ver
      }
    } catch {
      /* ignore */
    }
    return null
  }, [])

  const networkMismatch =
    !!address && !!walletNetworkPassphrase && walletNetworkPassphrase !== NETWORK_PASSPHRASE

  const isConnected = !!address

  // Single WatchWalletChanges watcher that handles both concerns:
  //   1. Network mismatch — update walletNetworkPassphrase/walletNetwork on
  //      poll (only when values change) so the banner reflects the extension's current network.
  //   2. Account switch (issue #59) — when the address changes, update the
  //      in-app address state and invalidate all wallet-scoped React Query
  //      caches so no previous account's data lingers.
  //   3. Tab visibility (issue #218) — pause watcher when tab is hidden, resume on visibility.
  useEffect(() => {
    if (!isConnected) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting derived wallet state on disconnect is a legitimate sync pattern
      setWalletNetworkPassphrase(null)
      setWalletNetwork(null)
      return
    }

    let watcher: WatchWalletChanges | null = null
    let isPaused = typeof document !== 'undefined' && document.hidden

    const startWatcher = () => {
      if (watcher) return
      watcher = new WatchWalletChanges(WALLET_WATCH_INTERVAL_MS)
      watcher.watch((params) => {
        if (params.error) return

        // --- Issue #218: Only call state setters when values change ---
        const nextPassphrase = params.networkPassphrase || null
        if (nextPassphrase !== walletNetworkPassphraseRef.current) {
          walletNetworkPassphraseRef.current = nextPassphrase
          setWalletNetworkPassphrase(nextPassphrase)
        }

        const nextNetwork = params.network || null
        if (nextNetwork !== walletNetworkRef.current) {
          walletNetworkRef.current = nextNetwork
          setWalletNetwork(nextNetwork)
        }

        // --- account switch tracking ---
        const newAddr = params.address
        if (newAddr && newAddr !== addressRef.current) {
          addressRef.current = newAddr
          setAddress(newAddr)
          queryClient.invalidateQueries({ queryKey: ['userData'] })
          queryClient.invalidateQueries({ queryKey: ['userLoans'] })
          queryClient.invalidateQueries({ queryKey: ['stake'] })
        }
      })
    }

    const stopWatcher = () => {
      if (watcher) {
        watcher.stop()
        watcher = null
      }
    }

    if (!isPaused) {
      startWatcher()
    }

    const handleVisibilityChange = async () => {
      if (typeof document === 'undefined') return
      if (document.hidden) {
        isPaused = true
        stopWatcher()
      } else {
        isPaused = false
        // Resume & immediate check on visibility
        try {
          const { address: currentAddr } = readAddress(await getAddress())
          if (currentAddr && currentAddr !== addressRef.current) {
            addressRef.current = currentAddr
            setAddress(currentAddr)
            queryClient.invalidateQueries({ queryKey: ['userData'] })
            queryClient.invalidateQueries({ queryKey: ['userLoans'] })
            queryClient.invalidateQueries({ queryKey: ['stake'] })
          }
          const net = await getNetwork()
          if (!net.error) {
            const nextPass = net.networkPassphrase || null
            if (nextPass !== walletNetworkPassphraseRef.current) {
              walletNetworkPassphraseRef.current = nextPass
              setWalletNetworkPassphrase(nextPass)
            }
            const nextNet = net.network || null
            if (nextNet !== walletNetworkRef.current) {
              walletNetworkRef.current = nextNet
              setWalletNetwork(nextNet)
            }
          }
        } catch {
          /* ignore */
        }
        startWatcher()
      }
    }

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange)
    }

    return () => {
      stopWatcher()
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }
    }
  }, [isConnected, queryClient])

  // Restore a previously-authorized session on load
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await checkVersion()
        const allowed = await isAllowed()
        const ok = typeof allowed === 'boolean' ? allowed : allowed?.isAllowed
        if (ok && !cancelled) {
          const { address: addr } = readAddress(await getAddress())
          if (addr && !cancelled) setAddress(addr)
        }
      } catch {
        /* Freighter not installed — stay disconnected. */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [checkVersion])

  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      const version = await checkVersion()
      if (version && !isVersionAtLeast(version, MIN_FREIGHTER_VERSION)) {
        toast.error(`Outdated Freighter extension (${version}). Minimum supported version is ${MIN_FREIGHTER_VERSION}.`)
      }
      const { address: addr, error } = readAddress(await requestAccess())
      if (error || !addr) {
        toast.error(
          error
            ? `Wallet connection failed: ${error}`
            : 'Could not connect. Is the Freighter extension installed?'
        )
        return
      }
      setAddress(addr)
      try {
        const net = await getNetwork()
        if (!net.error) {
          setWalletNetworkPassphrase(net.networkPassphrase || null)
          setWalletNetwork(net.network || null)
        }
      } catch {
        /* Network check will be retried by the watcher effect above. */
      }
      toast.success('Wallet connected')
    } catch {
      toast.error('Freighter wallet not found. Install it at freighter.app')
    } finally {
      setConnecting(false)
    }
  }, [checkVersion])

  const disconnect = useCallback(() => {
    setAddress(null)
    // Clear all cached query data so no previous account's data lingers
    // after disconnect — matches the account-switch behaviour above.
    queryClient.clear()
    toast('Wallet disconnected')
  }, [queryClient])

  const signXDR = useCallback(
    async (xdr: string, options?: { timeoutMs?: number; signal?: AbortSignal }): Promise<string> => {
      if (!address) throw new Error('Wallet not connected')
      if (networkMismatch) {
        throw new Error(
          `Wallet network mismatch: Freighter is on ${passphraseLabel(
            walletNetworkPassphrase || ''
          )}, this app is configured for ${passphraseLabel(NETWORK_PASSPHRASE)}. Switch Freighter's network to continue.`
        )
      }

      const timeoutMs = options?.timeoutMs ?? DEFAULT_SIGN_TIMEOUT_MS
      const signal = options?.signal

      if (signal?.aborted) {
        throw new Error('Signature request cancelled')
      }

      let timerId: ReturnType<typeof setTimeout> | undefined

      const timeoutPromise = new Promise<never>((_, reject) => {
        timerId = setTimeout(() => {
          reject(new Error('Signature request timed out. You can try again.'))
        }, timeoutMs)
      })
      // Prevent unhandled rejection warning when race settles
      timeoutPromise.catch(() => {})

      const abortPromise = signal
        ? new Promise<never>((_, reject) => {
            const onAbort = () => reject(new Error('Signature request cancelled'))
            if (signal.aborted) onAbort()
            else signal.addEventListener('abort', onAbort, { once: true })
          })
        : null

      try {
        const signPromise = signTransaction(xdr, {
          networkPassphrase: NETWORK_PASSPHRASE,
          address,
        })

        const promises: Promise<unknown>[] = [signPromise, timeoutPromise]
        if (abortPromise) promises.push(abortPromise)

        const rawRes = await Promise.race(promises)
        const { signedTxXdr, error } = readSigned(rawRes)

        if (error || !signedTxXdr) {
          throw new Error(error || 'Transaction signing was rejected')
        }
        return signedTxXdr
      } finally {
        if (timerId) clearTimeout(timerId)
      }
    },
    [address, networkMismatch, walletNetworkPassphrase]
  )

  return (
    <WalletContext.Provider
      value={{
        address,
        isConnected: !!address,
        connecting,
        connect,
        disconnect,
        signXDR,
        networkMismatch,
        walletNetwork,
        freighterVersion,
        isVersionSupported,
      }}
    >
      {networkMismatch && (
        <div
          role="alert"
          className="fixed top-0 inset-x-0 z-[100] bg-red-600 text-white text-sm font-medium px-4 py-2 text-center shadow-md"
        >
          Wallet network mismatch: Freighter is set to{' '}
          <strong>{walletNetwork || passphraseLabel(walletNetworkPassphrase || '')}</strong>,
          this app expects <strong>{passphraseLabel(NETWORK_PASSPHRASE)}</strong>. Switch
          Freighter&apos;s network — transactions are blocked until it matches.
        </div>
      )}
      {!isVersionSupported && freighterVersion && (
        <div
          role="alert"
          className="fixed top-8 inset-x-0 z-[99] bg-amber-600 text-white text-sm font-medium px-4 py-2 text-center shadow-md"
        >
          Outdated Freighter wallet detected ({freighterVersion}). Please update to version {MIN_FREIGHTER_VERSION} or newer.
        </div>
      )}
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext)
  if (!ctx) throw new Error('useWallet must be used within a WalletProvider')
  return ctx
}
