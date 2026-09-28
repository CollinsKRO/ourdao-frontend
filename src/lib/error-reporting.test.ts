import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  reportError,
  isErrorReportingOptedIn,
  setErrorReportingOptIn,
  ERROR_REPORTING_OPT_IN_KEY,
} from './error-reporting'

describe('error-reporting — opt-in gate', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('defaults to opted-out', () => {
    expect(isErrorReportingOptedIn()).toBe(false)
  })

  it('reportError is a no-op when opted out — nothing reaches the sink', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportError(new Error('boom'))
    // console.error is also used for other logging elsewhere in the app,
    // but error-reporting itself must not call it at all when opted out.
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('setErrorReportingOptIn persists the preference', () => {
    setErrorReportingOptIn(true)
    expect(window.localStorage.getItem(ERROR_REPORTING_OPT_IN_KEY)).toBe('true')
    expect(isErrorReportingOptedIn()).toBe(true)

    setErrorReportingOptIn(false)
    expect(isErrorReportingOptedIn()).toBe(false)
  })
})

describe('error-reporting — scrubbing when opted in', () => {
  const STELLAR_ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUV'

  beforeEach(() => {
    window.localStorage.clear()
    setErrorReportingOptIn(true)
  })

  afterEach(() => {
    window.localStorage.clear()
  })

  it('scrubs a Stellar address out of the error message before reporting', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportError(new Error(`Transfer failed for account ${STELLAR_ADDRESS}`))

    expect(spy).toHaveBeenCalled()
    const [, payload] = spy.mock.calls[0]
    expect(JSON.stringify(payload)).not.toContain(STELLAR_ADDRESS)
    expect(payload.message).toContain('[redacted-address]')
    spy.mockRestore()
  })

  it('scrubs a Stellar address out of nested context', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportError(new Error('failed'), { borrower: STELLAR_ADDRESS, nested: { addr: STELLAR_ADDRESS } })

    const [, payload] = spy.mock.calls[0]
    expect(JSON.stringify(payload)).not.toContain(STELLAR_ADDRESS)
    spy.mockRestore()
  })

  it('extracts an x-correlation-id passed directly in context', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportError(new Error('failed'), { 'x-correlation-id': 'corr-123' })

    const [, payload] = spy.mock.calls[0]
    expect(payload.correlationId).toBe('corr-123')
    spy.mockRestore()
  })

  it('extracts an x-correlation-id from a Headers object', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const headers = new Headers({ 'x-correlation-id': 'corr-456' })
    reportError(new Error('failed'), { headers })

    const [, payload] = spy.mock.calls[0]
    expect(payload.correlationId).toBe('corr-456')
    spy.mockRestore()
  })
})
