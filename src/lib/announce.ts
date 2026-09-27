/**
 * Screen-reader announcements for status that is otherwise only visual
 * (transaction progress, loading -> loaded transitions, load failures).
 *
 * A single pair of persistent, visually-hidden live regions (<LiveAnnouncer>,
 * mounted once in Providers) owns every announcement. Live regions are only
 * reliably announced when the region already exists before its content
 * changes, which is why toasts — inserted with their content — are silenced
 * (aria-live="off") and this module speaks instead. One source also means an
 * in-place toast update by id (loading -> success) produces exactly one
 * announcement per state, never a duplicate.
 */
export type Politeness = 'polite' | 'assertive'

export interface Announcement {
  id: number
  message: string
  politeness: Politeness
}

type Listener = (announcement: Announcement) => void

const listeners = new Set<Listener>()
let seq = 0

/** `assertive` interrupts the reader (use for failures); `polite` waits its turn. */
export function announce(message: string, politeness: Politeness = 'polite'): void {
  const announcement = { id: ++seq, message, politeness }
  listeners.forEach((listener) => listener(announcement))
}

export function subscribeToAnnouncements(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
