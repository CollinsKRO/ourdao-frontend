/**
 * Tests for the client logger (#267).
 *
 * These fail without `src/lib/logger.ts`: the level defaults, the redaction
 * and the no-bare-console rule have nothing to assert against otherwise.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  logger,
  getLogLevel,
  setLogLevel,
  isLevelEnabled,
  formatAddress,
  scrub,
  type LogLevel,
} from './logger'

const ADDRESS = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'

let errorSpy: ReturnType<typeof vi.spyOn>
let warnSpy: ReturnType<typeof vi.spyOn>
let infoSpy: ReturnType<typeof vi.spyOn>
let debugSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
  setLogLevel('debug')
})

afterEach(() => {
  setLogLevel(null)
  vi.restoreAllMocks()
})

describe('level control', () => {
  it('is silent in production unless a level is set', () => {
    // vi.stubEnv rather than a direct assignment: Next types NODE_ENV as
    // read-only, so `process.env.NODE_ENV = 'production'` is a type error.
    vi.stubEnv('NODE_ENV', 'production')
    setLogLevel(null)
    expect(getLogLevel()).toBe('silent')
    logger.error('should not appear')
    expect(errorSpy).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })

  it('defaults to debug outside production', () => {
    setLogLevel(null)
    expect(getLogLevel()).toBe('debug')
    logger.debug('shown')
    expect(debugSpy).toHaveBeenCalledTimes(1)
  })

  it('suppresses everything below the configured level', () => {
    setLogLevel('warn')
    logger.error('e')
    logger.warn('w')
    logger.info('i')
    logger.debug('d')
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(infoSpy).not.toHaveBeenCalled()
    expect(debugSpy).not.toHaveBeenCalled()
  })

  it('honours silent at any level', () => {
    setLogLevel('silent')
    logger.error('e')
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('reports whether a level would be written', () => {
    setLogLevel('warn')
    expect(isLevelEnabled('error')).toBe(true)
    expect(isLevelEnabled('warn')).toBe(true)
    expect(isLevelEnabled('info')).toBe(false)
  })

  it('rejects an unknown level', () => {
    expect(() => setLogLevel('verbose' as LogLevel)).toThrow(/Unknown log level/)
  })

  it('omits the context argument entirely when none is given', () => {
    logger.info('no context')
    expect(infoSpy).toHaveBeenCalledWith('[info] no context')
  })
})

describe('what may never be logged', () => {
  it('truncates a Stellar address in free text', () => {
    logger.warn(`address is ${ADDRESS}`)
    const written = warnSpy.mock.calls[0]?.[0] as string
    expect(written).not.toContain(ADDRESS)
    expect(written).toContain(formatAddress(ADDRESS))
  })

  it('truncates addresses inside context strings', () => {
    logger.error('failed', { user: ADDRESS })
    const context = errorSpy.mock.calls[0]?.[1] as { user: string }
    expect(context.user).toBe(formatAddress(ADDRESS))
  })

  it('drops a signed transaction XDR by key, whatever it is called', () => {
    for (const key of ['xdr', 'signedXdr', 'signed_xdr', 'SIGNED-XDR']) {
      logger.error('submitting', { [key]: 'AAAAAg...' })
      // Read the call just made, not the first one in the spy.
      const context = errorSpy.mock.calls.at(-1)?.[1] as Record<string, string>
      expect(context[key]).toBe('[redacted]')
    }
  })

  it('drops document passwords and decrypted content', () => {
    logger.error('open', { password: 'hunter2', decryptedContent: 'deed text' })
    const context = errorSpy.mock.calls[0]?.[1] as Record<string, string>
    expect(context.password).toBe('[redacted]')
    expect(context.decryptedContent).toBe('[redacted]')
  })

  it('truncates an address carried in an Error message and stack', () => {
    const error = new Error(`rejected for ${ADDRESS}`)
    error.stack = `Error: rejected for ${ADDRESS}\n at wallet`
    logger.error('caught', { error })
    const context = errorSpy.mock.calls[0]?.[1] as { error: { message: string; stack: string } }
    expect(context.error.message).not.toContain(ADDRESS)
    expect(context.error.stack).not.toContain(ADDRESS)
  })

  it('leaves non-sensitive values intact', () => {
    logger.info('state', { epoch: 4, active: true, tags: ['a', 'b'] })
    expect(infoSpy).toHaveBeenCalledWith('[info] state', {
      epoch: 4,
      active: true,
      tags: ['a', 'b'],
    })
  })

  it('redacts nested values', () => {
    expect(scrub({ outer: { password: 'x' } })).toEqual({
      outer: { password: '[redacted]' },
    })
  })

  it('formats an address without leaking the middle', () => {
    const formatted = formatAddress(ADDRESS)
    expect(formatted.startsWith(ADDRESS.slice(0, 5))).toBe(true)
    expect(formatted.endsWith(ADDRESS.slice(-4))).toBe(true)
    expect(formatted).not.toContain(ADDRESS.slice(5, 20))
  })

  it('leaves a short string alone rather than mangling it', () => {
    expect(formatAddress('short')).toBe('short')
  })
})

/**
 * The enforcement half of #267: "Client logging goes through one module".
 *
 * A new `console.*` call in `src/lib/` or `src/hooks/` fails this test, so the
 * convention cannot quietly lapse. `error-reporting.ts` is the single
 * exception: its `console.error` is the reporting sink, not a log line, and
 * routing it through the logger would silence opted-in reports in production
 * (where the default level is `silent`).
 */
describe('no bare console calls outside the logger', () => {
  const ROOTS = ['src/lib', 'src/hooks']
  /**
   * The two files allowed to reach `console` directly, and why.
   *
   * `error-reporting.ts` is a genuine exception rather than an oversight: its
   * `console.error` is the opt-in reporting sink, not a log line. Routing it
   * through the logger would silence a report the member explicitly agreed to
   * send, because production defaults to `silent`.
   */
  const EXEMPT: Record<string, string> = {
    'src/lib/logger.ts': 'the logger itself',
    'src/lib/error-reporting.ts': 'opt-in reporting sink, not a log line',
  }

  function* walk(dir: string): Generator<string> {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) {
        yield* walk(full)
      } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
        yield full
      }
    }
  }

  it('finds no direct console use in src/lib or src/hooks', () => {
    const offenders: string[] = []

    for (const root of ROOTS) {
      for (const file of walk(root)) {
        if (file in EXEMPT) continue
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            // A `console.` inside a doc comment is naming the rule, not calling it.
            if (/^\s*(\*|\/\/)/.test(line)) return
            if (!/console\.(log|info|warn|error|debug|trace|dir|table)\b/.test(line)) return
            offenders.push(`${file}:${i + 1}: ${line.trim()}`)
          })
      }
    }

    expect(offenders).toEqual([])
  })
})
