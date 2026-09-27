'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { MAIN_CONTENT_ID } from '@/lib/a11y'
import { reportError } from '@/lib/error-reporting'

/**
 * Route-segment error boundary. Without this, an uncaught render error
 * anywhere below the root layout unmounts the whole app with no way to
 * recover short of a hard reload — this gives React a place to catch it and
 * offers a retry that doesn't lose the rest of the app's state (wallet
 * connection, query cache, etc).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { reset: resetQueries } = useQueryErrorResetBoundary()

  useEffect(() => {
    console.error('Route error boundary caught:', error)
    // Subject to the member's error-reporting opt-in (#247) — see
    // src/lib/error-reporting.ts. `digest` is Next.js's own reference id
    // for this error occurrence, safe to include as-is.
    reportError(error, { boundary: 'route', digest: error.digest })
  }, [error])

  return (
    <main id={MAIN_CONTENT_ID} tabIndex={-1} className="flex min-h-screen items-center justify-center bg-background px-4 focus:outline-none">
      <div className="w-full max-w-md rounded-xl border border-border bg-card text-card-foreground p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold text-foreground">This page couldn&apos;t load</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong rendering this page. You can try again, or head
          back to the dashboard.
        </p>
        {error.message && (
          <p className="mt-3 rounded-lg bg-muted p-2 font-mono text-xs text-muted-foreground break-words">
            {error.message}
          </p>
        )}
        <div className="mt-5 flex justify-center gap-2">
          <Button
            onClick={() => {
              // A boundary that was tripped by a failed query re-throws the
              // cached error on remount unless the query error is reset too.
              resetQueries()
              reset()
            }}
          >
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    </main>
  )
}
