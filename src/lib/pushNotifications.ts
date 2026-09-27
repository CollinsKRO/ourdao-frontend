import { logger } from '@/lib/logger'
import { useCallback, useSyncExternalStore } from 'react'

// Shared shapes for backend-derived notifications/activity (see
// hooks/useNotifications.ts, which maps the indexer's rows onto these).
export interface NotificationData {
  id: string
  title: string
  message: string
  type: 'info' | 'success' | 'warning' | 'error'
  timestamp: Date
  read: boolean
  actionUrl?: string
  metadata?: Record<string, unknown>
}

export interface ActivityItem {
  id: string
  type: 'loan' | 'vote' | 'proposal' | 'member' | 'treasury' | 'document'
  title: string
  description: string
  timestamp: Date
  user?: string
  metadata?: Record<string, unknown>
}

// Notification.permission has no standard cross-browser change event, so
// this is a minimal manually-notified store: requestPermission() below
// calls notifyPermissionChange() after the browser updates the real value,
// and every hook instance re-reads it via useSyncExternalStore.
const permissionListeners = new Set<() => void>()
function subscribeToPermission(callback: () => void) {
  permissionListeners.add(callback)
  return () => permissionListeners.delete(callback)
}
function notifyPermissionChange() {
  permissionListeners.forEach((listener) => listener())
}
function getPermissionSnapshot(): NotificationPermission {
  return 'Notification' in window ? Notification.permission : 'default'
}
function getPermissionServerSnapshot(): NotificationPermission {
  return 'default'
}

function subscribeNoop() {
  return () => {}
}
function getSupportedSnapshot(): boolean {
  return 'Notification' in window
}
function getSupportedServerSnapshot(): boolean {
  return false
}

/** Thin wrapper around the browser Notification API: permission state +
 *  requesting it + firing a notification. The only real (non-mock) piece of
 *  the old lib/eventListener.ts.
 *
 *  Reading `window`/`Notification` directly during render is impure (and
 *  would mismatch between server and client), so both values go through
 *  useSyncExternalStore rather than a useState+useEffect pair. */
export const usePushNotifications = () => {
  const permission = useSyncExternalStore(
    subscribeToPermission,
    getPermissionSnapshot,
    getPermissionServerSnapshot
  )
  const supported = useSyncExternalStore(subscribeNoop, getSupportedSnapshot, getSupportedServerSnapshot)

  const requestPermission = useCallback(async () => {
    if (!supported) return false

    try {
      // Browsers may reject this outright (not a DOMException resolve) when
      // it isn't called from within a user gesture (e.g. a click handler) —
      // callers should only invoke this from one.
      const result = await Notification.requestPermission()
      notifyPermissionChange()
      return result === 'granted'
    } catch (err) {
      logger.warn('Notification permission request failed', { err })
      return false
    }
  }, [supported])

  const sendNotification = useCallback(
    (title: string, options?: NotificationOptions) => {
      if (permission !== 'granted') return null

      return new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options,
      })
    },
    [permission]
  )

  return {
    supported,
    permission,
    requestPermission,
    sendNotification,
  }
}
