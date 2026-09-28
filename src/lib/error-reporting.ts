/**
 * Client-side error reporting (#247).
 *
 * OurDAO is a member-facing wallet app — an uncaught render error or failed
 * query previously vanished into `console.error` with nobody watching. This
 * module gives every catch site (route error boundaries, the query cache's
 * onError) one place to report through, without picking a third-party
 * vendor unilaterally:
 *
 * - **Opt-in.** Nothing is reported unless the member has explicitly opted
 *   in (see `isErrorReportingOptedIn` / `setErrorReportingOptIn`), stored in
 *   localStorage under `ERROR_REPORTING_OPT_IN_KEY`. Default is off.
 * - **Scrubbed.** Stellar public keys (G + 55 base32 chars) are redacted
 *   from the error message and from any string found in `context` before
 *   anything is reported — a wallet address is member-identifying data.
 * - **Correlation id.** If `context` carries an `x-correlation-id` (e.g.
 *   read off a failed backend fetch's response headers), it's pulled out
 *   and included as its own field so a report can be matched to a backend
 *   log line.
 * - **Provider-agnostic sink.** No error-reporting vendor (Sentry, etc.) is
 *   wired up here — none has been chosen/approved yet. The sink below logs
 *   the scrubbed, structured payload via `console.error`. Swap `sendReport`
 *   for a real provider's SDK call (e.g. `Sentry.captureException`) once
 *   one is chosen; every other concern (opt-in, scrubbing, correlation id)
 *   stays the same.
 *
 * See docs/error-reporting.md for the member-facing summary of this.
 */

export const ERROR_REPORTING_OPT_IN_KEY = 'ourdao:error-reporting-opt-in'

// Standard Stellar/Soroban public key shape: 'G' followed by 55 base32
// characters (A-Z, 2-7). Matches both account and contract-style G-addresses.
const STELLAR_ADDRESS_PATTERN = /\bG[A-Z2-7]{55}\b/g

const REDACTED = '[redacted-address]'

/** Replace any Stellar-address-shaped substring with a redaction marker. */
function scrubAddresses(input: string): string {
  return input.replace(STELLAR_ADDRESS_PATTERN, REDACTED)
}

/** Recursively scrub string values in a context object; leaves shape intact. */
function scrubContext(value: unknown): unknown {
  if (typeof value === 'string') return scrubAddresses(value)
  if (Array.isArray(value)) return value.map(scrubContext)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrubContext(v)
    }
    return out
  }
  return value
}

/**
 * Is error reporting currently opted in? Reads localStorage; fails closed
 * (returns false) if localStorage isn't available (SSR, private browsing
 * with storage disabled, etc.) so nothing is ever reported without an
 * explicit, successfully-persisted opt-in.
 */
export function isErrorReportingOptedIn(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(ERROR_REPORTING_OPT_IN_KEY) === 'true'
  } catch {
    return false
  }
}

/** Set the member's error-reporting opt-in preference. */
export function setErrorReportingOptIn(optedIn: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(ERROR_REPORTING_OPT_IN_KEY, optedIn ? 'true' : 'false')
  } catch {
    // localStorage unavailable — nothing to do; isErrorReportingOptedIn()
    // will keep reading as opted-out.
  }
}

/**
 * Try to pull an `x-correlation-id` out of arbitrary error-reporting
 * context. Callers may pass it as a plain `correlationId`/`x-correlation-id`
 * field, or as a `headers` value (a `Headers` instance or a plain
 * header-name/value record) from a failed fetch `Response`.
 */
function extractCorrelationId(context?: Record<string, unknown>): string | undefined {
  if (!context) return undefined

  const direct = context['x-correlation-id'] ?? context.correlationId
  if (typeof direct === 'string' && direct) return direct

  const headers = context.headers
  if (headers instanceof Headers) {
    return headers.get('x-correlation-id') ?? undefined
  }
  if (headers && typeof headers === 'object') {
    const record = headers as Record<string, unknown>
    const value = record['x-correlation-id'] ?? record['X-Correlation-Id']
    if (typeof value === 'string') return value
  }

  return undefined
}

/**
 * Send the scrubbed report somewhere. This is the one function to replace
 * once a real error-reporting provider is chosen (e.g.
 * `Sentry.captureException(payload)`). Kept console-based for now to avoid
 * picking a third-party service unilaterally as part of this change — the
 * wiring everywhere else in the app is already provider-agnostic.
 */
function sendReport(payload: Record<string, unknown>): void {
  console.error('[error-report]', payload)
}

/**
 * Report an error, subject to the member's opt-in preference. No-op (does
 * not touch console or any sink) when the member hasn't opted in.
 *
 * `context` is free-form metadata about where the error happened (e.g. a
 * TanStack Query `queryKey`, or fetch response headers) — any string values
 * anywhere in it are scrubbed the same as the error message.
 */
export function reportError(error: unknown, context?: Record<string, unknown>): void {
  if (!isErrorReportingOptedIn()) return

  const rawMessage = error instanceof Error ? error.message : String(error)
  const message = scrubAddresses(rawMessage)
  const stack = error instanceof Error && error.stack ? scrubAddresses(error.stack) : undefined
  const correlationId = extractCorrelationId(context)
  const scrubbedContext = context ? (scrubContext(context) as Record<string, unknown>) : undefined

  sendReport({
    message,
    stack,
    correlationId,
    context: scrubbedContext,
    timestamp: new Date().toISOString(),
  })
}
