'use client'

import { useEffect, useState } from 'react'
import { subscribeToAnnouncements, type Announcement } from '@/lib/announce'

/**
 * The app's two persistent live regions. Rendered once (Providers) so they
 * exist before anything is announced. Each announcement mounts a fresh child
 * (keyed by id) so an identical message announced twice is still re-read.
 */
export function LiveAnnouncer() {
  const [polite, setPolite] = useState<Announcement | null>(null)
  const [assertive, setAssertive] = useState<Announcement | null>(null)

  useEffect(
    () =>
      subscribeToAnnouncements((a) =>
        a.politeness === 'assertive' ? setAssertive(a) : setPolite(a)
      ),
    []
  )

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only" data-testid="live-polite">
        {polite && <span key={polite.id}>{polite.message}</span>}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="true" className="sr-only" data-testid="live-assertive">
        {assertive && <span key={assertive.id}>{assertive.message}</span>}
      </div>
    </>
  )
}
