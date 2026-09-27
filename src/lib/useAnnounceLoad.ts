'use client'

import { useEffect, useRef } from 'react'
import { announce } from '@/lib/announce'

/**
 * Announces a data view's loading -> loaded (or loading -> failed) transition,
 * which otherwise swaps a skeleton for rows silently. Announces only on a
 * transition observed after mount, so a view that is already loaded when it
 * mounts stays quiet.
 */
export function useAnnounceLoad(label: string, isLoading: boolean, isError = false): void {
  const wasLoading = useRef(isLoading)
  const wasError = useRef(isError)

  useEffect(() => {
    if (wasLoading.current && !isLoading) {
      if (isError) announce(`${label} failed to load.`, 'assertive')
      else announce(`${label} loaded.`)
    } else if (!wasError.current && isError && !isLoading) {
      announce(`${label} failed to load.`, 'assertive')
    }
    wasLoading.current = isLoading
    wasError.current = isError
  }, [label, isLoading, isError])
}
