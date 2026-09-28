/**
 * Guards for the user-facing message catalogue (#268).
 *
 * These tests fail if the catalogue is removed, if its copy drifts from what
 * tests/users rely on, or if a message is re-introduced as an inline literal
 * at a call site — see docs/messages.md for the house style.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { Children, type ReactElement, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MESSAGES, presentBackendError } from '@/lib/messages'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type Sink = {
  statics: { path: string; value: string }[]
  templates: { path: string; value: string }[]
}

function collect(obj: unknown, path: string, sink: Sink): void {
  if (typeof obj === 'string') {
    sink.statics.push({ path, value: obj })
  } else if (typeof obj === 'function') {
    const fn = obj as (...args: string[]) => unknown
    const out = fn(...Array<string>(fn.length).fill('Sample'))
    if (typeof out === 'string') sink.templates.push({ path, value: out })
  } else if (obj && typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      collect(value, path ? `${path}.${key}` : key, sink)
    }
  }
}

function allMessages(): Sink {
  const sink: Sink = { statics: [], templates: [] }
  collect(MESSAGES, '', sink)
  return sink
}

function walk(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...walk(full))
    else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full)
  }
  return files
}

/** Comments are not copy — strip them before scanning for inline literals. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const SRC = join(process.cwd(), 'src')

/** Where user-facing copy is allowed to live outside src/lib/messages.ts. */
const EXEMPT = [
  join('src', 'lib', 'messages.ts'), // the catalogue itself
  join('src', 'lib', 'contract-errors.ts'), // separate code → message catalogue
  join('src', 'app', 'api', 'documents', 'route.ts'), // API contract strings
]

// ---------------------------------------------------------------------------
// pinned copy — exact strings existing tests and users depend on
// ---------------------------------------------------------------------------

describe('message catalogue contents', () => {
  it('pins the copy that tests and users rely on', () => {
    expect(MESSAGES.validation.loanAmountInvalid).toBe('Please enter a valid loan amount')
    expect(MESSAGES.validation.loanAmountExceedsMax('100 XLM')).toBe(
      'Amount exceeds the current maximum loan of 100 XLM'
    )
    expect(MESSAGES.validation.stellarAddress).toBe(
      'Enter a valid Stellar destination address (G… or C…)'
    )
    expect(MESSAGES.toasts.loanRequestSubmitted).toBe('Loan request submitted successfully!')
    expect(MESSAGES.toasts.loanNotFound).toBe('Loan not found')
    expect(MESSAGES.empty.gates.dashboard).toBe(
      'Connect your wallet to access the member dashboard'
    )
    expect(MESSAGES.empty.loanProposals).toBe('No loan proposals yet.')
    expect(MESSAGES.empty.treasuryWithdrawals).toBe('No treasury withdrawals yet.')
    expect(MESSAGES.documents.accessDenied).toBe('You do not have permission to view this doc')
    expect(MESSAGES.wallet.signatureCancelled).toBe('Signature request cancelled')
  })

  it('keeps the substrings useWriteAction classifies retries on', () => {
    // The retry classifier matches message.includes('timed out'/'cancelled');
    // these substrings are load-bearing, not copy.
    expect(MESSAGES.writes.timedOut('Repaying loan')).toContain('timed out')
    expect(MESSAGES.writes.cancelled('Repaying loan')).toContain('cancelled')
    expect(MESSAGES.wallet.signatureTimedOut).toContain('timed out')
    expect(MESSAGES.wallet.signatureCancelled).toContain('cancelled')
  })

  it('keeps the write-toast shapes the UI joins on', () => {
    expect(MESSAGES.writes.pending('Staking')).toBe('Staking…')
    // Trailing space: the "View transaction" link is appended inline.
    expect(MESSAGES.writes.confirmed('Staking')).toBe('Staking confirmed ')
    expect(MESSAGES.writes.viewTransaction).toBe('View transaction')
    expect(MESSAGES.network.mismatch('Testnet', 'Mainnet')).toBe(
      "Wallet network mismatch: Freighter is on Testnet, this app is configured for Mainnet. Switch Freighter's network to continue."
    )
  })

  it('renders the mismatch banner as one readable sentence around emphasised networks', () => {
    const el = MESSAGES.network.mismatchBanner('Testnet', 'Mainnet')
    const text = Children.toArray(
      (el as ReactElement<{ children: ReactNode }>).props.children
    ).join('')
    expect(text).toBe(
      "Wallet network mismatch: Freighter is set to Testnet, this app expects Mainnet. Switch Freighter's network — transactions are blocked until it matches."
    )
  })
})

// ---------------------------------------------------------------------------
// house style (docs/messages.md)
// ---------------------------------------------------------------------------

describe('house style', () => {
  // The success toast joins an inline link, so it keeps a trailing space.
  const TRAILING_SPACE_OK = new Set(['writes.confirmed'])

  it('trims whitespace and never double-spaces', () => {
    for (const { path, value } of [...allMessages().statics, ...allMessages().templates]) {
      if (!TRAILING_SPACE_OK.has(path)) {
        expect(value, `${path} has surrounding whitespace`).toBe(value.trim())
      }
      expect(value, `${path} contains a double space`).not.toMatch(/ {2}/)
    }
  })

  it('starts every message with a capital letter', () => {
    for (const { path, value } of [...allMessages().statics, ...allMessages().templates]) {
      expect(value[0], `${path} does not start sentence-cased`).toMatch(/[A-Z]/)
    }
  })

  it('uses no all-caps jargon beyond DAO/IPFS/MB', () => {
    for (const { path, value } of [...allMessages().statics, ...allMessages().templates]) {
      const caps = value.match(/[A-Z]{2,}/g) ?? []
      const jargon = caps.filter((word) => !['DAO', 'IPFS', 'MB'].includes(word))
      expect(jargon, `${path} contains jargon ${JSON.stringify(jargon)}`).toEqual([])
    }
  })

  it('defines each message exactly once (one condition → one message)', () => {
    const seen = new Map<string, string>()
    for (const { path, value } of allMessages().statics) {
      const prior = seen.get(value)
      expect(prior, `"${value}" is defined twice (${prior} and ${path})`).toBeUndefined()
      seen.set(value, path)
    }
    expect(seen.size).toBeGreaterThan(40)
  })
})

// ---------------------------------------------------------------------------
// backend { error, correlationId } presentation policy
// ---------------------------------------------------------------------------

describe('presentBackendError', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the backend sentence but never the correlation id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const shown = presentBackendError(
      { error: 'Pinning provider is unavailable.', correlationId: 'req-abc-123' },
      'Document upload failed (502)'
    )
    expect(shown).toBe('Pinning provider is unavailable.')
    expect(shown).not.toContain('req-abc-123')
    expect(warn).toHaveBeenCalledWith('[backend-error]', 'req-abc-123')
  })

  it('falls back to a catalogue message when the payload has no usable error', () => {
    const fallback = MESSAGES.documents.uploadRejected(500)
    expect(presentBackendError(null, fallback)).toBe(fallback)
    expect(presentBackendError(undefined, fallback)).toBe(fallback)
    expect(presentBackendError({ error: '   ' }, fallback)).toBe(fallback)
    expect(presentBackendError({ error: 500, correlationId: 42 }, fallback)).toBe(fallback)
  })

  it('passes a plain string body through, trimmed', () => {
    expect(presentBackendError('  Gateway timed out.  ', 'fallback')).toBe('Gateway timed out.')
  })
})

// ---------------------------------------------------------------------------
// source parity — the fail-without-the-change guard
// ---------------------------------------------------------------------------

describe('call sites draw copy from the catalogue', () => {
  // A representative slice of every group; substrings for templated messages.
  const PINNED: string[] = [
    'Connect your wallet first',
    'Signature request cancelled',
    'Signature request timed out. You can try again.',
    'Wallet not connected',
    'Freighter wallet not found. Install it at freighter.app',
    'You must be a DAO member to request loans',
    'Please enter a valid loan amount',
    'Amount exceeds the current maximum loan of',
    'You already have an active loan',
    'Loan request submitted successfully!',
    'Rewards claimed successfully!',
    'Registration successful! Welcome to the DAO!',
    'Registration failed. Please try again.',
    'Please accept the terms and conditions',
    'Enter a valid amount greater than zero',
    'Enter a valid Stellar destination address (G… or C…)',
    'A reason is required',
    'Repayment amount must be greater than zero',
    'Amount must be greater than zero',
    'Loan not found',
    'No loan proposals yet.',
    'No treasury withdrawals yet.',
    'No notifications yet',
    'Please connect your wallet to access governance.',
    'Please connect your wallet to access the treasury.',
    'Please connect your wallet to access the admin panel.',
    'Please connect your wallet to view privacy features.',
    'Connect your wallet to access the member dashboard',
    'Wallet Not Connected',
    'Connect Your Wallet',
    'You do not have permission to view this doc',
    'Password is required for encrypted uploads',
    'No admin/governance events indexed yet.',
    "couldn't be loaded and are missing from this list. Try again shortly.",
    'Updating consensus threshold',
    'Some files exceed the',
    'Registering membership',
  ]

  it('declares no pinned message as an inline literal outside the catalogue', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const rel = join('src', relative(SRC, file))
      if (EXEMPT.some((exempt) => rel.endsWith(exempt))) continue
      const body = stripComments(readFileSync(file, 'utf8'))
      for (const message of PINNED) {
        if (body.includes(message)) offenders.push(`${rel}: "${message}"`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('actually imports the catalogue at the toast plumbing call site', () => {
    const writes = readFileSync(join(SRC, 'hooks', 'dao', 'writes.ts'), 'utf8')
    expect(writes).toContain("from '@/lib/messages'")
    expect(writes).toContain('MESSAGES.writes.timedOut(label)')
    expect(writes).not.toContain('timed out. Signature request took too long')
  })
})
