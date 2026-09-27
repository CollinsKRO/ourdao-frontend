import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BuildBadge } from '@/components/BuildBadge'
import type { BuildInfo } from '@/lib/build-info'

// The badge must exist and be copyable so a bug report can include the build
// identity without transcription (issue #269).
//
// build-info.ts captures process.env into module-level constants at import
// time — deliberate, since the values are fixed per build — so rather than
// re-evaluating the module per test (which duplicates React via resetModules
// and silently kills event handlers), the tests mutate one shared BuildInfo
// object that the mocked getBuildInfo returns.
const mockInfo: BuildInfo = {
  version: '0.2.0',
  commit: '',
  buildTime: '',
  contractId: '',
}

vi.mock('@/lib/build-info', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/build-info')>()
  return {
    ...actual,
    getBuildInfo: () => ({ ...mockInfo }),
  }
})

const clipboardWrite = vi.fn().mockResolvedValue(undefined)

function setInfo(overrides: Partial<BuildInfo>) {
  Object.assign(mockInfo, { commit: '', buildTime: '', contractId: '' }, overrides)
}

describe('BuildBadge', () => {
  let user: ReturnType<typeof userEvent.setup>

  beforeEach(() => {
    vi.clearAllMocks()
    // Order matters: userEvent.setup() must run before the clipboard stub is
    // installed. With defineProperty first, copy handlers silently no-op
    // (verified by bisection: setup-then-define passes, the reverse fails).
    user = userEvent.setup()
    // jsdom leaves navigator.clipboard undefined (it's secure-context only);
    // inject a configurable stub rather than Object.assign, which fails on
    // getter-only Navigator properties.
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: clipboardWrite },
      configurable: true,
    })
  })

  it('renders version and short commit when the build was stamped', () => {
    setInfo({
      version: '0.2.0',
      commit: '681a7b4474de63f76a46ff94f5bcafd3d571212b',
      buildTime: '2026-09-26T12:00:00Z',
      contractId: 'CABCDEF123',
    })
    render(<BuildBadge />)

    expect(screen.getByTestId('build-badge-version')).toHaveTextContent('0.2.0')
    expect(screen.getByTestId('build-badge-commit')).toHaveTextContent('681a7b4')
    expect(screen.queryByText('dev')).not.toBeInTheDocument()
  })

  it('marks itself as a dev build when CI stamped nothing', () => {
    setInfo({ version: '0.2.0' })
    render(<BuildBadge />)

    expect(screen.getByTestId('build-badge-version')).toHaveTextContent('0.2.0')
    expect(screen.queryByTestId('build-badge-commit')).not.toBeInTheDocument()
    expect(screen.getByText('dev')).toBeInTheDocument()
  })

  it('copies the full identifier for a bug report', async () => {
    setInfo({
      version: '0.2.0',
      commit: '681a7b4474de63f76a46ff94f5bcafd3d571212b',
      buildTime: '2026-09-26T12:00:00Z',
      contractId: 'CABCDEF123',
    })
    render(<BuildBadge />)

    await user.click(screen.getByRole('button', { name: /Build 0\.2\.0/ }))
    await user.click(screen.getByRole('button', { name: /copy build info/i }))

    await waitFor(() => {
      expect(clipboardWrite).toHaveBeenCalledWith('0.2.0 (681a7b4 · 2026-09-26T12:00:00Z · CABCDEF123)')
    })
    expect(await screen.findByText('Copied')).toBeInTheDocument()
  })

  it('shows the full identifier in the popover for inspection', async () => {
    setInfo({
      version: '0.2.0',
      commit: '681a7b4474de63f76a46ff94f5bcafd3d571212b',
      buildTime: '2026-09-26T12:00:00Z',
      contractId: '',
    })
    render(<BuildBadge />)

    await user.click(screen.getByRole('button', { name: /Build 0\.2\.0/ }))

    const full = await screen.findByTestId('build-info-full')
    expect(full).toHaveTextContent('0.2.0 (681a7b4 · 2026-09-26T12:00:00Z)')
    expect(screen.getByText('not configured')).toBeInTheDocument()
  })

  it('does not get stuck on Copied when the clipboard rejects', async () => {
    clipboardWrite.mockRejectedValueOnce(new Error('denied'))
    setInfo({ version: '0.2.0' })
    render(<BuildBadge />)

    await user.click(screen.getByRole('button', { name: /Build 0\.2\.0/ }))
    await user.click(screen.getByRole('button', { name: /copy build info/i }))

    await waitFor(() => expect(clipboardWrite).toHaveBeenCalled())
    // Rejected copy never claims success.
    expect(screen.queryByText('Copied')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /copy build info/i })).toBeInTheDocument()
  })
})
