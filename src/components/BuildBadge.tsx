'use client'

/**
 * Build identifier in the app header (issue #269): shows the running build's
 * version + commit + build time + configured contract id, so a bug report can
 * state which build it came from without transcription — a click copies the
 * full identifier, and copy success is announced by text change (testable
 * without an ARIA-live region) and via aria-live for screen readers.
 *
 * Sits next to the network badge. Deliberately unobtrusive: monospace, muted,
 * truncated to 7 chars — the popover carries the full story.
 */
import { useEffect, useRef, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Copy, GitCommitHorizontal } from 'lucide-react'
import { formatBuildInfo, getBuildInfo, isDevBuild, shortCommit } from '@/lib/build-info'

const COPIED_RESET_MS = 2000

export function BuildBadge() {
  const info = getBuildInfo()
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear the pending reset if the popover closes or the component unmounts
  // mid-timeout, so "Copied" can't get stuck or fire after remount.
  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current)
    }
  }, [])

  const handleCopy = async () => {
    const text = formatBuildInfo(info)
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      if (copyTimer.current) clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS)
    } catch {
      // Clipboard permission denied (or insecure context): leave the text
      // selectable in the popover instead of surfacing an error for a
      // convenience action.
    }
  }

  const short = shortCommit(info.commit)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Build ${formatBuildInfo(info)}`}
          className="h-7 hidden px-2 font-mono text-xs text-muted-foreground md:inline-flex"
        >
          <GitCommitHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          <span data-testid="build-badge-version">{info.version}</span>
          {short && (
            <>
              {' '}
              <span data-testid="build-badge-commit">({short})</span>
            </>
          )}
          {isDevBuild(info) && <span className="text-amber-600 dark:text-amber-400">dev</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto max-w-sm">
        <div className="space-y-2">
          <p className="font-mono text-xs leading-relaxed break-all text-foreground" data-testid="build-info-full">
            {formatBuildInfo(info)}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Version</dt>
            <dd className="font-mono">{info.version}</dd>
            <dt className="text-muted-foreground">Commit</dt>
            <dd className="font-mono break-all">{info.commit || '— (dev)'}</dd>
            <dt className="text-muted-foreground">Build time</dt>
            <dd className="font-mono">{info.buildTime || '— (dev)'}</dd>
            <dt className="text-muted-foreground">Contract</dt>
            <dd className="font-mono break-all">{info.contractId || 'not configured'}</dd>
          </dl>
          <Button variant="outline" size="sm" className="w-full" onClick={handleCopy}>
            {copied ? 'Copied' : 'Copy build info'}
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
          <p aria-live="polite" className="sr-only">
            {copied ? 'Build information copied to clipboard' : ''}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  )
}
