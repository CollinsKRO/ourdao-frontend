'use client'

/**
 * Backend-backed notification/activity hooks. Notifications are scoped to the
 * connected wallet; the activity feed is the DAO-wide indexed event stream.
 *
 * Marking-as-read is persisted through the backend's authenticated
 * `PATCH /api/notifications/:id/read` and `/read-all` endpoints, so each one
 * costs a Freighter signature (see src/lib/backend-auth.ts). The read state is
 * therefore applied optimistically and **rolled back** if the signed request
 * doesn't land — a rejected prompt, a 401, or an unreachable backend all leave
 * the notification unread and say so, instead of showing a change that a reload
 * silently undoes (#306). Removal stays client-side only, since the backend has
 * no delete endpoint.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useWallet } from '@/lib/wallet'
import { backend, type BackendEvent, type BackendNotification, type MutationFailure, type MutationResult } from '@/lib/backend'
import { serializePerAddress } from '@/lib/backend-auth'
import { formatStellarAddress, isStellarAddress } from '@/lib/stellar'
import type { ActivityItem, NotificationData } from '@/lib/pushNotifications'
import { queryKeys } from '@/lib/query-keys'
import { QUERY_REFRESH_INTERVAL_MS } from '@/constants'
import { announce } from '@/lib/announce'
import toast from 'react-hot-toast'

function isBackendConfigured(): boolean {
  if (backend && typeof (backend as { isConfigured?: () => boolean }).isConfigured === 'function') {
    return (backend as { isConfigured: () => boolean }).isConfigured()
  }
  if (process.env.NEXT_PUBLIC_BACKEND_URL === '') return false
  if (process.env.NEXT_PUBLIC_BACKEND_URL) return true
  return process.env.NODE_ENV === 'test' && !!backend
}

function toNotification(n: BackendNotification): NotificationData {
  return {
    id: String(n.id),
    title: n.title,
    message: n.message,
    type: n.type,
    timestamp: new Date(n.created_at),
    read: n.read,
  }
}

/**
 * Client-side read/removed state, keyed by the address that owns it.
 *
 * Keying by address (rather than one module-level Set) is what stops a wallet
 * switch from carrying read state across accounts: the new address simply has no
 * entry, and its notifications arrive with whatever the backend has on record
 * (#306). Entries are only ever written for the currently connected address.
 */
interface LocalNotificationState {
  read: Set<string>
  removed: Set<string>
}

const EMPTY_LOCAL_STATE: LocalNotificationState = { read: new Set(), removed: new Set() }

/**
 * Notifications for the connected member, polled from the indexer. Read/removed
 * state is layered on top locally. The listening/auto controls are retained for
 * API compatibility with the previous mock hook but are effectively always-on
 * (the query polls regardless).
 */
export function useAutoNotifications() {
  const { address, signMessage } = useWallet()
  const queryClient = useQueryClient()
  const [localByAddress, setLocalByAddress] = useState<Record<string, LocalNotificationState>>({})

  // Read inside callbacks that must see the address they were created for
  // without re-subscribing the whole hook to every wallet change.
  const addressRef = useRef<string | null>(address)
  useEffect(() => {
    addressRef.current = address
  }, [address])

  const backendConfigured = isBackendConfigured()
  const { data, isError, refetch } = useQuery({
    queryKey: address ? queryKeys.notifications(address) : queryKeys.notificationsDisabled(),
    enabled: !!address && backendConfigured,
    queryFn: () => backend.getNotifications(address!),
    refetchInterval: backendConfigured ? QUERY_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  })

  const local = address ? (localByAddress[address] ?? EMPTY_LOCAL_STATE) : EMPTY_LOCAL_STATE

  const notifications = useMemo<NotificationData[]>(() => {
    return (data ?? [])
      .map(toNotification)
      .filter((n) => !local.removed.has(n.id))
      .map((n) => (local.read.has(n.id) ? { ...n, read: true } : n))
  }, [data, local])

  const unreadCount = useMemo(() => notifications.filter((n) => !n.read).length, [notifications])

  const updateLocal = useCallback(
    (owner: string, mutate: (prev: LocalNotificationState) => LocalNotificationState) => {
      setLocalByAddress((prev) => ({
        ...prev,
        [owner]: mutate(prev[owner] ?? EMPTY_LOCAL_STATE),
      }))
    },
    []
  )

  /** Surface a failed write and undo the optimistic read state it applied. */
  const reportFailure = useCallback((failure: MutationFailure) => {
    toast.error(failure.message)
    announce(failure.message, 'assertive')
  }, [])

  /**
   * Send one signed mutation and reconcile the optimistic read state with what
   * the backend actually did.
   *
   * `apply` is the optimistic change, `revert` undoes it, and both are keyed to
   * the address that was connected when the member acted — so a wallet switch
   * mid-flight can't roll back the *new* account's state.
   *
   * Never throws: these are fired from onClick handlers that don't await, so a
   * rejection here would surface as an unhandled promise rejection instead of
   * the error toast the member needs.
   */
  const runSignedMutation = useCallback(
    async (
      owner: string,
      apply: () => void,
      revert: () => void,
      send: () => Promise<MutationResult>
    ) => {
      apply()
      let result: MutationResult
      try {
        // Serialized per address: the backend's nonce is single-use, so two
        // overlapping mutations for one address would invalidate each other.
        result = await serializePerAddress(owner, send)
      } catch (err) {
        result = {
          ok: false,
          status: null,
          reason: 'unavailable',
          message: err instanceof Error ? err.message : 'The change could not be saved.',
        }
      }
      if (!result.ok) {
        revert()
        reportFailure(result)
        return false
      }
      void queryClient.invalidateQueries({ queryKey: queryKeys.notifications(owner) })
      return true
    },
    [queryClient, reportFailure]
  )

  const markAsRead = useCallback(
    async (id: string) => {
      const owner = addressRef.current
      if (!owner) return
      const numericId = Number(id)
      if (!Number.isFinite(numericId)) return

      await runSignedMutation(
        owner,
        () => updateLocal(owner, (prev) => ({ ...prev, read: new Set(prev.read).add(id) })),
        () =>
          updateLocal(owner, (prev) => {
            const read = new Set(prev.read)
            read.delete(id)
            return { ...prev, read }
          }),
        () => backend.markNotificationRead(numericId, { address: owner, signMessage })
      )
    },
    [signMessage, updateLocal, runSignedMutation]
  )

  const markAllAsRead = useCallback(async () => {
    const owner = addressRef.current
    if (!owner) return
    const ids = (data ?? []).map((n) => String(n.id))

    await runSignedMutation(
      owner,
      () => updateLocal(owner, (prev) => ({ ...prev, read: new Set([...prev.read, ...ids]) })),
      () => updateLocal(owner, (prev) => ({ ...prev, read: new Set() })),
      () => backend.markAllNotificationsRead(owner, { address: owner, signMessage })
    )
  }, [data, signMessage, updateLocal, runSignedMutation])

  const removeNotification = useCallback((id: string) => {
    const owner = addressRef.current
    if (!owner) return
    updateLocal(owner, (prev) => ({ ...prev, removed: new Set(prev.removed).add(id) }))
  }, [updateLocal])

  const clearAllNotifications = useCallback(() => {
    const owner = addressRef.current
    if (!owner) return
    updateLocal(owner, (prev) => ({ ...prev, removed: new Set((data ?? []).map((n) => String(n.id))) }))
  }, [data, updateLocal])

  const requestPermission = useCallback(async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission()
      } catch (err) {
        console.warn('Notification permission request failed:', err)
      }
    }
  }, [])

  const noop = useCallback(() => {}, [])

  return {
    notifications,
    isError,
    refetch,
    unreadCount,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAllNotifications,
    requestPermission,
    // Compatibility surface — data is polled continuously, so "listening" is on.
    enableAutoNotifications: noop,
    disableAutoNotifications: noop,
    autoNotifyEnabled: true,
    startListening: noop,
    stopListening: noop,
    isListening: !!address,
  }
}

// Map a raw contract event symbol to an activity category + label.
const ACTIVITY_META: Record<string, { type: ActivityItem['type']; title: string; description: string }> = {
  joined: { type: 'member', title: 'New member joined', description: 'A member joined the DAO' },
  exited: { type: 'member', title: 'Member exited', description: 'A member withdrew their share' },
  claimed: { type: 'treasury', title: 'Yield claimed', description: 'A member claimed rewards' },
  loan_req: { type: 'loan', title: 'Loan requested', description: 'A new loan proposal was opened' },
  loan_edit: { type: 'loan', title: 'Loan proposal edited', description: 'A loan proposal was updated' },
  loan_vote: { type: 'vote', title: 'Vote cast', description: 'A vote was cast on a loan proposal' },
  loan_appr: { type: 'loan', title: 'Loan approved', description: 'A loan was approved and disbursed' },
  loan_rej: { type: 'loan', title: 'Loan rejected', description: 'A loan proposal can no longer reach quorum' },
  loan_wait: { type: 'loan', title: 'Loan awaiting funds', description: 'A loan was approved but the treasury is too small to disburse it — top up the treasury' },
  loan_rpy: { type: 'loan', title: 'Loan repayment', description: 'A loan repayment was received' },
  interest: { type: 'treasury', title: 'Interest distributed', description: 'Loan interest was distributed to members' },
  tre_prop: { type: 'treasury', title: 'Treasury proposal', description: 'A treasury withdrawal was proposed' },
  tre_vote: { type: 'vote', title: 'Vote cast', description: 'A vote was cast on a treasury proposal' },
  tre_exec: { type: 'treasury', title: 'Treasury withdrawal executed', description: 'A treasury withdrawal was executed' },
  tre_rej: { type: 'treasury', title: 'Treasury proposal rejected', description: 'A treasury withdrawal was rejected' },
  tre_wait: { type: 'treasury', title: 'Treasury withdrawal awaiting funds', description: 'A treasury withdrawal was approved but the treasury is too small to execute it — top up the treasury' },
  staked: { type: 'treasury', title: 'Member staked', description: 'A member staked for voting weight' },
  unstaked: { type: 'treasury', title: 'Member unstaked', description: 'A member reduced their stake' },
  name_reg: { type: 'member', title: 'Name registered', description: 'A member registered a name' },
  committed: { type: 'vote', title: 'Private vote committed', description: 'A commit-reveal vote was committed' },
  revealed: { type: 'vote', title: 'Private vote revealed', description: 'A commit-reveal vote was revealed' },
}

function firstAddress(data: unknown): string | undefined {
  if (!Array.isArray(data)) return undefined
  const hit = data.find((v) => typeof v === 'string' && isStellarAddress(v))
  return typeof hit === 'string' ? formatStellarAddress(hit) : undefined
}

function toActivity(ev: BackendEvent): ActivityItem {
  const meta = ACTIVITY_META[ev.symbol] ?? {
    type: 'proposal' as const,
    title: ev.symbol,
    description: 'Contract event',
  }
  return {
    id: ev.id,
    type: meta.type,
    title: meta.title,
    description: meta.description,
    timestamp: new Date(ev.closed_at),
    user: firstAddress(ev.data),
  }
}

/** DAO-wide activity feed from the indexed contract event stream. */
export function useActivityFeed(limit: number = 50) {
  const backendConfigured = isBackendConfigured()
  const { data, isError, refetch } = useQuery({
    queryKey: queryKeys.activity(limit),
    enabled: backendConfigured,
    queryFn: () => backend.getEvents(limit),
    refetchInterval: backendConfigured ? QUERY_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  })

  const activities = useMemo<ActivityItem[]>(() => (data ?? []).map(toActivity), [data])

  // Retained for API compatibility; the feed is server-driven and read-only.
  const addActivity = useCallback(() => {}, [])

  return { activities, addActivity, isError, refetch }
}
