/**
 * Client-side logging (#267).
 *
 * Every log call in `src/lib/` and `src/hooks/` used to go straight to
 * `console`, which left three things undecided:
 *
 * - **No level control.** A `console.debug` in a hot path was as loud as an
 *   error, and there was no way to quiet the app down without editing code.
 * - **No production default.** Output was as visible in a member's browser in
 *   production as in development.
 * - **No rule about content.** A wallet address is the member's identity in
 *   this system, and nothing stopped a debug call from writing one — see
 *   `ourdao-backend#133`, where exactly that happened on `/auth/challenge`.
 *
 * So logging goes through this module, which is the only place in `src/lib/`
 * and `src/hooks/` allowed to touch `console`. A lint-style test enforces
 * that (see `logger.test.ts`).
 *
 * ## What may never be logged
 *
 * A wallet address is member-identifying, and a signed transaction, a document
 * password and decrypted document content are all replayable or confidential.
 * The rules:
 *
 * - **Never logged, at any level:** signed transaction XDRs, document
 *   passwords, decrypted or plaintext document content, and anything derived
 *   from them. `scrub` drops these by key, so `logger.warn('x', { password })`
 *   cannot leak even by accident.
 * - **Addresses are truncated, never dropped.** `ourdao-backend#133` closed
 *   with the position that an address is acceptable at `debug` provided it is
 *   truncated the way the frontend renders one, so this module truncates any
 *   Stellar address it sees — including in free text and in `Error.message` /
 *   `Error.stack` — rather than relying on each call site to remember.
 *   `formatAddress` is exported for the cases where a readable form is wanted
 *   explicitly.
 *
 * Note the deliberate difference from `error-reporting.ts`, which *removes*
 * addresses (`[redacted-address]`) instead of truncating them. That is
 * correct there and wrong here: a report is written to be pasted into a
 * public bug tracker, while a log line stays on the member's own machine.
 *
 * ## Levels
 *
 * `silent` < `error` < `warn` < `info` < `debug`.
 *
 * - Production defaults to `silent`: nothing is written unless a level is
 *   deliberately set.
 * - Everywhere else defaults to `debug`.
 * - `NEXT_PUBLIC_LOG_LEVEL` overrides the default, and `setLogLevel` overrides
 *   that at runtime (used by tests and by the debug settings UI).
 *
 * See docs/logging.md for the member-facing summary.
 */

export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug'

const LEVEL_ORDER: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
}

/** Standard Stellar/Soroban public key: 'G' + 55 base32 chars (A-Z, 2-7). */
const STELLAR_ADDRESS_PATTERN = /\bG[A-Z2-7]{55}\b/g

/** Marker substituted for a value that must never reach the console. */
const REDACTED = '[redacted]'

/**
 * Context keys whose values are dropped whatever they contain. Matched
 * case-insensitively against the key with separators removed, so `signedXdr`,
 * `signed_xdr` and `signed-xdr` are all covered by one entry.
 */
const SENSITIVE_KEYS = [
  'password',
  'passphrase',
  'secret',
  'mnemonic',
  'seed',
  'seedphrase',
  'privatekey',
  'xdr',
  'signedxdr',
  'decrypted',
  'decryptedcontent',
  'plaintext',
] as const

/** Reduce a key to the form the SENSITIVE_KEYS list is written in. */
function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function isSensitiveKey(key: string): boolean {
  const flat = normaliseKey(key)
  return SENSITIVE_KEYS.some((candidate) => flat.includes(candidate))
}

/**
 * Shorten a Stellar address to `GABCD…WXYZ` for display.
 *
 * Exported because `ourdao-backend#133` asks the backend to truncate the same
 * way, and because a call site that wants a readable address should say so
 * rather than hoping the scrubber leaves it alone.
 */
export function formatAddress(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 5)}…${address.slice(-4)}`
}

/** Replace every Stellar address in a string with its truncated form. */
function truncateAddresses(input: string): string {
  return input.replace(STELLAR_ADDRESS_PATTERN, (address) => formatAddress(address))
}

/**
 * Scrub a value for logging: addresses truncated, sensitive keys dropped.
 *
 * Recurses through arrays and plain objects, leaves the shape intact so a
 * reader can still see what was there, and passes non-string leaves through
 * untouched apart from the address pass.
 */
export function scrub(value: unknown, key?: string): unknown {
  if (key !== undefined && isSensitiveKey(key)) return REDACTED
  if (typeof value === 'string') return truncateAddresses(value)
  if (Array.isArray(value)) return value.map((entry) => scrub(entry))
  if (value instanceof Error) {
    // Keep the message and stack useful without letting either carry an
    // address in the clear; other own-properties are dropped because an Error
    // can hold a whole response body.
    return {
      name: value.name,
      message: truncateAddresses(value.message),
      stack: value.stack ? truncateAddresses(value.stack) : undefined,
    }
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = scrub(v, k)
    }
    return out
  }
  return value
}

let overrideLevel: LogLevel | null = null

/** The level used when nothing has been overridden. */
function defaultLevel(): LogLevel {
  // `silent` in production: a member's browser console is not the place for
  // this app's diagnostics unless someone has asked for them.
  if (process.env.NODE_ENV === 'production') return 'silent'
  const fromEnv = process.env.NEXT_PUBLIC_LOG_LEVEL as LogLevel | undefined
  if (fromEnv && fromEnv in LEVEL_ORDER) return fromEnv
  return 'debug'
}

/** The level currently in effect. */
export function getLogLevel(): LogLevel {
  return overrideLevel ?? defaultLevel()
}

/**
 * Set the level at runtime, overriding `NEXT_PUBLIC_LOG_LEVEL`. Pass `null`
 * to fall back to the default again.
 */
export function setLogLevel(level: LogLevel | null): void {
  if (level !== null && !(level in LEVEL_ORDER)) {
    throw new Error(`Unknown log level: ${String(level)}`)
  }
  overrideLevel = level
}

/** Would a call at `level` be written? Lets callers skip building an expensive message. */
export function isLevelEnabled(level: LogLevel): boolean {
  return LEVEL_ORDER[level] <= LEVEL_ORDER[getLogLevel()]
}

function write(level: Exclude<LogLevel, 'silent'>, message: string, context?: unknown): void {
  // The one place in src/lib and src/hooks permitted to touch console.
  const emit = level === 'error' ? console.error : level === 'warn' ? console.warn : console[level]
  // The message is scrubbed as well as the context: a template literal is the
  // easy way to leak an address, and this is the last point before the write.
  const safeMessage = truncateAddresses(message)
  if (context === undefined) emit.call(console, `[${level}] ${safeMessage}`)
  else emit.call(console, `[${level}] ${safeMessage}`, scrub(context))
}

export const logger = {
  error: (message: string, context?: unknown) => {
    if (isLevelEnabled('error')) write('error', message, context)
  },
  warn: (message: string, context?: unknown) => {
    if (isLevelEnabled('warn')) write('warn', message, context)
  },
  info: (message: string, context?: unknown) => {
    if (isLevelEnabled('info')) write('info', message, context)
  },
  debug: (message: string, context?: unknown) => {
    if (isLevelEnabled('debug')) write('debug', message, context)
  },
}
