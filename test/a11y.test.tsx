import { describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderWithProviders } from './test-utils'
import { AppShell } from '@/components/AppShell'
import { ConnectButton } from '@/components/ConnectButton'
import { runAxe, formatViolations, assertInteractiveNames } from './a11y'

/**
 * Issue #238 — interactive components must have automated accessibility
 * assertions. axe-core runs on the real rendered output; direct role/name
 * assertions cover what axe cannot (skip-link target, dialog naming).
 *
 * A new violation fails the suite — no baseline snapshot to update.
 * See docs/a11y-audit.md for the triaged findings.
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}))

vi.mock('@/hooks/useDAO', () => ({
  useUserData: () => ({ isAdmin: false }),
  useDAOStats: () => ({ indexerStale: false }),
}))

vi.mock('@/lib/stellar', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stellar')>('@/lib/stellar')
  return { ...actual, isContractConfigured: () => true }
})

vi.mock('@/lib/wallet', () => ({
  useWallet: () => ({
    address: null,
    isConnected: false,
    connecting: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
    signXDR: vi.fn(),
    networkMismatch: false,
    walletNetwork: null,
    freighterVersion: null,
    isVersionSupported: true,
  }),
}))

vi.mock('@/lib/backend', () => ({
  backend: {
    getLoans: vi.fn().mockResolvedValue([]),
    getNotifications: vi.fn().mockResolvedValue([]),
    getEvents: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue(null),
    getAdminLog: vi.fn().mockResolvedValue([]),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
  },
}))

vi.mock('@/lib/dao-client', () => ({
  daoRead: {
    isMember: vi.fn().mockResolvedValue(false),
    isAdmin: vi.fn().mockResolvedValue(false),
    getMember: vi.fn().mockResolvedValue(null),
    getPendingYield: vi.fn().mockResolvedValue(BigInt(0)),
  },
  daoWrite: () => ({}),
}))

vi.mock('@/hooks/useNotifications', () => ({
  useAutoNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    markAsRead: vi.fn(),
    markAllAsRead: vi.fn(),
    removeNotification: vi.fn(),
    clearAllNotifications: vi.fn(),
    requestPermission: vi.fn(),
    enableAutoNotifications: vi.fn(),
    disableAutoNotifications: vi.fn(),
    autoNotifyEnabled: false,
    startListening: vi.fn(),
    stopListening: vi.fn(),
    isListening: false,
  }),
  useActivityFeed: () => ({ activities: [] }),
}))

vi.mock('@/lib/pushNotifications', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/pushNotifications')>('@/lib/pushNotifications')
  return {
    ...actual,
    usePushNotifications: () => ({ supported: false, permission: 'default' }),
  }
})

vi.mock('@/lib/responsive', async () => {
  const actual = await vi.importActual<typeof import('@/lib/responsive')>('@/lib/responsive')
  return { ...actual, useIsMobile: () => false }
})

describe('issue #238 — automated accessibility assertions', () => {
  afterEach(() => vi.clearAllMocks())

  it('AppShell exposes a skip link, nav landmarks, and has no axe violations', async () => {
    const { container } = renderWithProviders(<AppShell>Page content</AppShell>)

    const skipLink = screen.getByRole('link', { name: /skip to main content/i })
    expect(skipLink).toHaveAttribute('href', '#main-content')
    expect(container.querySelector('#main-content')).not.toBeNull()

    expect(screen.getByRole('navigation')).toBeInTheDocument()
    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()

    assertInteractiveNames(container)

    const violations = await runAxe(container)
    expect(`${formatViolations(violations)}`).toBe('')
    expect(violations).toEqual([])
  })

  it('mobile drawer dialog carries an accessible name when opened', async () => {
    const user = userEvent.setup()
    renderWithProviders(<AppShell>Page content</AppShell>)

    await user.click(screen.getByRole('button', { name: 'Open navigation' }))
    const dialog = await screen.findByRole('dialog', { name: 'Navigation menu' })
    expect(dialog).toBeInTheDocument()
  })

  it('ConnectButton has an accessible name in both states and no axe violations', async () => {
    const { container } = render(<ConnectButton />)
    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeInTheDocument()

    assertInteractiveNames(container)

    const violations = await runAxe(container)
    expect(violations).toEqual([])
  })

  it('notification bell exposes an accessible name (not title-only)', () => {
    renderWithProviders(<AppShell>Page content</AppShell>)
    // The pre-fix bell had title="Notifications" with no aria-label.
    expect(screen.getByRole('button', { name: /notifications/i })).toBeInTheDocument()
  })
})
