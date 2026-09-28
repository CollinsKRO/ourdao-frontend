import { describe, it, expect, vi, afterEach } from 'vitest'
import { formatToken, formatDate } from '../utils'
import { formatStellarAddress } from '../stellar'

// ---------------------------------------------------------------------------
// formatToken — integer string inputs (existing behaviour, must not regress)
// ---------------------------------------------------------------------------
describe('formatToken — integer string inputs', () => {
  it('formats a zero stroop amount', () => {
    expect(formatToken('0')).toBe('0')
    expect(formatToken(BigInt(0))).toBe('0')
  })

  it('formats a standard 7-decimal stroop amount', () => {
    // 10_000_000 stroops = 1.0 token
    expect(formatToken('10000000')).toBe('1')
  })

  it('formats an amount with a fractional part', () => {
    // 15_000_000 stroops = 1.5 token → displayed as 1.5
    expect(formatToken('15000000')).toBe('1.5')
  })

  it('returns a lower bound when value is non-zero but rounds to nothing', () => {
    // 1 stroop = 0.0000001, which rounds away at displayDecimals=4
    expect(formatToken('1')).toBe('<0.0001')
  })

  it('handles negative values', () => {
    expect(formatToken('-10000000')).toBe('-1')
    expect(formatToken(BigInt(-15000000))).toBe('-1.5')
  })

  it('handles negative values below display precision', () => {
    expect(formatToken('-1')).toBe('-<0.0001')
  })

  it('handles empty string as zero', () => {
    expect(formatToken('')).toBe('0')
  })

  it('accepts BigInt input directly', () => {
    expect(formatToken(BigInt('10000000'))).toBe('1')
    expect(formatToken(BigInt('25000000'))).toBe('2.5')
  })

  it('respects custom decimals', () => {
    // 2 decimals: 100 = 1.00
    expect(formatToken('100', { decimals: 2 })).toBe('1')
    expect(formatToken('150', { decimals: 2 })).toBe('1.5')
  })

  it('respects custom displayDecimals', () => {
    // 12345670 stroops at 7 decimals = 1.234567 → show only 2 → 1.23
    expect(formatToken('12345670', { displayDecimals: 2 })).toBe('1.23')
  })
})

// ---------------------------------------------------------------------------
// formatToken — fractional string rejection (Issue: silent truncation)
// ---------------------------------------------------------------------------
describe('formatToken — fractional inputs are rejected', () => {
  it('rejects a fractional string and returns em-dash', () => {
    // Suppress the console.error we expect
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = formatToken('1.5')
    expect(result).toBe('—')
    expect(spy).toHaveBeenCalledWith(
      'formatToken failed:',
      expect.any(Error),
      expect.objectContaining({ value: '1.5' })
    )
    spy.mockRestore()
  })

  it('rejects a fractional number-like string', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(formatToken('0.5')).toBe('—')
    spy.mockRestore()
  })

  it('rejects a negative fractional string', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(formatToken('-1.5')).toBe('—')
    spy.mockRestore()
  })

  it('rejects exponent notation', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(formatToken('1e7')).toBe('—')
    expect(formatToken('1E7')).toBe('—')
    spy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// formatToken — catch block returns visible error (Issue: '0' on failure)
// ---------------------------------------------------------------------------
describe('formatToken — failure path is distinct from genuine zero', () => {
  it('genuine zero returns "0", not the error marker', () => {
    expect(formatToken('0')).toBe('0')
    expect(formatToken(BigInt(0))).toBe('0')
  })

  it('failure returns "—" (em-dash), not "0"', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // A string BigInt cannot parse
    expect(formatToken('not_a_number')).toBe('—')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('failure is logged through the logger (#267)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    formatToken('garbage')
    // The logger prefixes the level and carries the detail as scrubbed context.
    expect(spy).toHaveBeenCalledWith(
      '[error] formatToken failed',
      expect.objectContaining({ value: 'garbage' })
    )
    spy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// formatStellarAddress — output format pinning (Issue: duplicate formatters)
// ---------------------------------------------------------------------------
describe('formatStellarAddress — canonical output', () => {
  const FULL_ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV'

  it('truncates with proper ellipsis character (…) and 4/4 default', () => {
    const result = formatStellarAddress(FULL_ADDRESS)
    expect(result).toBe('GABC…STUV')
    // Must use the proper ellipsis, NOT three dots
    expect(result).toContain('…')
    expect(result).not.toContain('...')
  })

  it('returns empty string for undefined/null input', () => {
    expect(formatStellarAddress(undefined)).toBe('')
    expect(formatStellarAddress('')).toBe('')
  })

  it('returns the full address when it is short enough', () => {
    expect(formatStellarAddress('GABC')).toBe('GABC')
    // 4+4+1 = 9 chars — just at the boundary
    expect(formatStellarAddress('GABCDEFGH')).toBe('GABCDEFGH')
  })

  it('supports custom truncation length', () => {
    const result = formatStellarAddress(FULL_ADDRESS, 6)
    expect(result).toBe('GABCDE…QRSTUV')
  })
})

// ---------------------------------------------------------------------------
// formatDate — follows the browser locale instead of hardcoding en-US (#248)
// ---------------------------------------------------------------------------
describe('formatDate — locale handling', () => {
  const originalLanguage = navigator.language

  afterEach(() => {
    Object.defineProperty(navigator, 'language', {
      value: originalLanguage,
      configurable: true,
    })
  })

  it('formats using the browser locale (de-DE), not a hardcoded en-US', () => {
    Object.defineProperty(navigator, 'language', {
      value: 'de-DE',
      configurable: true,
    })

    // A fixed UTC timestamp so the assertion isn't timezone-flaky.
    const result = formatDate(new Date('2024-03-04T10:00:00Z'))

    // en-US would render this as "Mar 4, 2024, ..." — de-DE renders the day
    // before the month ("4. März 2024" style) and never contains a comma
    // after the day the way en-US does. This is the behavior that fails
    // against the old hardcoded `toLocaleDateString('en-US', ...)` call,
    // which ignores navigator.language entirely and always returns the
    // en-US shape regardless of what we set navigator.language to.
    const enUSShape = new Date('2024-03-04T10:00:00Z').toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    expect(result).not.toBe(enUSShape)
  })

  it('falls back gracefully and still returns a formatted string when locale is unset', () => {
    Object.defineProperty(navigator, 'language', {
      value: undefined,
      configurable: true,
    })
    const result = formatDate(new Date('2024-03-04T10:00:00Z'))
    expect(typeof result).toBe('string')
    expect(result).not.toBe('Invalid date')
  })

  it('still returns "Invalid date" for unparseable input', () => {
    expect(formatDate('not-a-date')).toBe('Invalid date')
  })
})
