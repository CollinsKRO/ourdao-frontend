'use client'

import { MAIN_CONTENT_ID } from '@/lib/a11y'

/**
 * WCAG 2.4.1 Bypass Blocks. The first focusable element on every route:
 * visually hidden until it receives keyboard focus, then jumps past the
 * header and navigation to the page's <main> landmark.
 */
export function SkipLink() {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      onClick={(e) => {
        // A hash jump moves the viewport but not focus in every browser (and
        // the target is not natively focusable), so move focus explicitly.
        const main = document.getElementById(MAIN_CONTENT_ID)
        if (!main) return
        e.preventDefault()
        main.focus()
        main.scrollIntoView?.()
      }}
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground focus:shadow-lg"
    >
      Skip to main content
    </a>
  )
}
