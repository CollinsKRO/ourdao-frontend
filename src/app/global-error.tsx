'use client'

import { useEffect } from 'react'
import { reportError } from '@/lib/error-reporting'

/**
 * Catches errors thrown by the root layout itself (outside what error.tsx
 * can reach, since error.tsx renders *inside* the layout). Must render its
 * own <html>/<body> — it fully replaces the root layout when active.
 *
 * That also means next-themes' script (which lives inside the normal
 * layout tree) never runs here, so there's no reliable signal for a
 * manually-chosen theme — only the OS-level prefers-color-scheme media
 * query is available, handled below via plain CSS custom properties
 * rather than Tailwind (which needs the .dark class this page can't set).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Global error boundary caught:', error)
    // Subject to the member's error-reporting opt-in (#247) — see
    // src/lib/error-reporting.ts.
    reportError(error, { boundary: 'global', digest: error.digest })
  }, [error])

  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif' }}>
        <style>{`
          :root {
            --ge-bg: #f9fafb;
            --ge-card-bg: #ffffff;
            --ge-card-border: #e5e7eb;
            --ge-heading: #111827;
            --ge-body: #4b5563;
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --ge-bg: #0a0e17;
              --ge-card-bg: #111827;
              --ge-card-border: #1f2937;
              --ge-heading: #f3f4f6;
              --ge-body: #9ca3af;
            }
          }
        `}</style>
        <main
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            background: 'var(--ge-bg)',
          }}
        >
          <div
            style={{
              maxWidth: '28rem',
              width: '100%',
              borderRadius: '0.75rem',
              border: '1px solid var(--ge-card-border)',
              background: 'var(--ge-card-bg)',
              padding: '1.5rem',
              textAlign: 'center',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            <h1 style={{ fontSize: '1.125rem', fontWeight: 600, color: 'var(--ge-heading)' }}>
              Something went wrong
            </h1>
            <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--ge-body)' }}>
              The app hit an unexpected error. Reloading usually fixes it.
            </p>
            <button
              onClick={reset}
              style={{
                marginTop: '1.25rem',
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                background: '#2563eb',
                color: 'white',
                fontSize: '0.875rem',
                fontWeight: 500,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
