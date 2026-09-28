'use client'

/**
 * Shared route guards for member-only pages.
 *
 * The bug these exist to fix (#307): on a hard refresh the app has two pieces
 * of state that are *both* legitimately false for the first few renders but
 * mean completely different things.
 *
 *   - `isConnected === false` because Freighter's `isAllowed()` / `getAddress()`
 *     haven't resolved yet — a connected wallet that merely hasn't said so.
 *   - `isMember === false` because the membership query is still running — the
 *     hook's `isMember` defaults to false until data lands.
 *
 * A guard that reads either one and acts on it immediately treats "I don't know
 * yet" as "no" and redirects a real member to `/` or `/register` on every hard
 * refresh. The page then renders the "Access Restricted" card for a beat even
 * after the address arrives, so the user sees a flash of the wrong screen.
 *
 * So the rule every guard here follows is: **wait for both, then decide.** The
 * only question this module answers is "may this visitor stay?" — what a page
 * renders once the answer is no stays with the page, because each one has its
 * own copy and its own call to action.
 *
 * A failed membership read is deliberately *not* a verdict. An RPC hiccup must
 * not log a member out; the page renders its own error state instead.
 */
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { UserData } from '@/types/dao'

export interface RequireMemberOptions {
  /** Where a connected non-member belongs. `null` waives the membership check. */
  memberRedirect?: string | null
  /** Where a visitor with no wallet belongs. */
  disconnectedRedirect?: string
  /**
   * The caller's own `useUserData()` result. Required rather than optional so
   * a guarded page has exactly one membership object: the guard decides from
   * the same data the page renders, and can't end up disagreeing with it
   * because it observed a separate query. Every guarded page already needs
   * `userData` to render, so there's nothing to pass but the same object.
   */
  userData: UserData
}

export interface RequireMemberResult {
  /** The membership data, whether supplied by the page or fetched here. */
  userData: UserData
  /**
   * True while the answer is still unknowable — the wallet is restoring or the
   * membership query is in flight. Render a skeleton, not a redirect.
   */
  isResolving: boolean
  /** The path being navigated to, or null when the visitor may stay. */
  redirectTo: string | null
  isConnected: boolean
  isMember: boolean
  /** The membership read failed; show an error state, don't redirect. */
  isError: boolean
}

/**
 * Guard a member-only route. Returns `isResolving` so the caller can render a
 * loading skeleton during the window that used to flash an access-restricted
 * card or bounce the member (#307).
 */
export function useRequireMember(options: RequireMemberOptions): RequireMemberResult {
  const { memberRedirect = '/register', disconnectedRedirect = '/', userData } = options
  const router = useRouter()
  const { isConnected, isLoading, isError, isMember } = userData

  const isResolving = isLoading

  const redirectTo: string | null = isResolving
    ? null
    : !isConnected
      ? disconnectedRedirect
      : !isError && !isMember && memberRedirect
        ? memberRedirect
        : null

  useEffect(() => {
    if (redirectTo) router.push(redirectTo)
  }, [redirectTo, router])

  return { userData, isResolving, redirectTo, isConnected, isMember, isError: !!isError }
}

/**
 * The mirror guard, for pages that only make sense *before* membership —
 * `/register` is the only one. Wait for the same reason as above: redirecting a
 * still-restoring wallet to /dashboard, or deciding a just-registered member is
 * "not yet a member", both produce a visible round trip through the wrong page.
 */
export function useRedirectIfMember(destination: string, userData: UserData) {
  const router = useRouter()
  const { isConnected, isLoading, isMember } = userData

  const shouldRedirect = !isLoading && isConnected && isMember

  useEffect(() => {
    if (shouldRedirect) router.push(destination)
  }, [shouldRedirect, destination, router])

  return { isResolving: isLoading, shouldRedirect }
}
