import { createElement, Fragment, type ReactNode } from 'react'

/**
 * Central catalogue of user-facing messages (#268).
 *
 * Everything the app says to a member — toasts, banners, field errors, empty
 * states, wallet gates — lives here so copy is reviewable in one place and can
 * be reworded (or translated later) without touching call sites. The house
 * style this file follows is documented in docs/messages.md:
 *
 * - Sentence case; one idea per message, ending in `.` (or `!` for a genuine
 *   success). Labels shown before an ellipsis in a loading toast are the
 *   exception (no terminal punctuation).
 * - One condition → one message. Never stack two problems into one string.
 * - Say the action when there is one ("You can try again.").
 * - No jargon: no raw error codes, HTTP statuses, or internal identifiers in
 *   the copy itself.
 * - Template helpers take every dynamic value as an argument — call sites
 *   never interpolate copy themselves.
 *
 * Two things deliberately live outside this file:
 *
 * - Contract revert codes: ./contract-errors.ts keeps its own code → message
 *   catalogue (same pattern, different lifecycle: kept in sync with
 *   ourdao-contracts).
 * - src/app/api/documents/route.ts response strings: those are the API's
 *   contract with tests/clients, not UI copy; when the UI surfaces one it goes
 *   through `presentBackendError` below (see docs/messages.md).
 */
export const MESSAGES = {
  /** Wallet connect / disconnect / sign — Freighter lifecycle. */
  wallet: {
    connectFirst: 'Connect your wallet first',
    pleaseConnectFirst: 'Please connect your wallet first',
    notConnected: 'Wallet not connected',
    connected: 'Wallet connected',
    disconnected: 'Wallet disconnected',
    connectionFailed: (detail: string) => `Wallet connection failed: ${detail}`,
    notInstalled: 'Could not connect. Is the Freighter extension installed?',
    extensionMissing: 'Freighter wallet not found. Install it at freighter.app',
    signingRejected: 'Transaction signing was rejected',
    signatureCancelled: 'Signature request cancelled',
    signatureTimedOut: 'Signature request timed out. You can try again.',
    outdatedExtension: (version: string, min: string) =>
      `Outdated Freighter extension (${version}). Minimum supported version is ${min}.`,
    outdatedBanner: (version: string, min: string) =>
      `Outdated Freighter wallet detected (${version}). Please update to version ${min} or newer.`,
  },

  /** Network configuration vs. what Freighter is pointed at. */
  network: {
    mismatch: (walletNetwork: string, appNetwork: string) =>
      `Wallet network mismatch: Freighter is on ${walletNetwork}, this app is configured for ${appNetwork}. Switch Freighter's network to continue.`,
    /** Top banner; the two network names are emphasised at the call site. */
    mismatchBanner: (walletNetwork: ReactNode, appNetwork: ReactNode): ReactNode =>
      createElement(
        Fragment,
        null,
        'Wallet network mismatch: Freighter is set to ',
        walletNetwork,
        ', this app expects ',
        appNetwork,
        ". Switch Freighter's network — transactions are blocked until it matches."
      ),
  },

  /** Form and flow guards — checked before anything is submitted. */
  validation: {
    memberOnlyLoanRequest: 'You must be a DAO member to request loans',
    loanAmountInvalid: 'Please enter a valid loan amount',
    loanAmountExceedsMax: (max: string) =>
      `Amount exceeds the current maximum loan of ${max}`,
    activeLoanExists: 'You already have an active loan',
    amountRequired: 'Enter an amount',
    amountInvalid: 'Enter a valid number',
    amountGreaterThanZero: 'Enter a valid amount greater than zero',
    amountMustBePositive: 'Amount must be greater than zero',
    amountExceedsOutstanding: (amount: string) =>
      `Amount exceeds outstanding balance of ${amount}`,
    activeLoanExistsExplain:
      'You already have an active loan. Please repay your current loan before requesting a new one.',
    repaymentMustBePositive: 'Repayment amount must be greater than zero',
    stellarAddress: 'Enter a valid Stellar destination address (G… or C…)',
    reasonRequired: 'A reason is required',
    termsRequired: 'Please accept the terms and conditions',
    privateVotingDisabled:
      'Private voting is disabled until commit/reveal voting is implemented. See /privacy.',
  },

  /**
   * Write-action plumbing (src/hooks/dao/writes.ts): one loading toast, one
   * outcome toast per action, prefixed by the action label.
   *
   * NOTE: `timedOut` / `cancelled` output is what the retry classifier in
   * `useWriteAction` matches on (`message.includes('timed out')` /
   * `includes('cancelled')`) — those substrings are load-bearing, not copy.
   */
  writes: {
    /** Present continuous label for each action, e.g. in "Requesting loan…". */
    labels: {
      register: 'Registering membership',
      requestLoan: 'Requesting loan',
      vote: 'Casting vote',
      repay: 'Repaying loan',
      markDefaulted: 'Marking loan defaulted',
      claimRewards: 'Claiming rewards',
      claimYield: 'Claiming yield',
      stake: 'Staking',
      unstake: 'Unstaking',
      proposeWithdrawal: 'Proposing withdrawal',
      attachDocument: 'Attaching document',
      pause: 'Pausing the DAO',
      unpause: 'Unpausing the DAO',
      addAdmin: 'Adding admin',
      removeAdmin: 'Removing admin',
      setThreshold: 'Updating consensus threshold',
    },
    pending: (label: string) => `${label}…`,
    /** Trailing space: the "View transaction" link follows inline. */
    confirmed: (label: string) => `${label} confirmed `,
    viewTransaction: 'View transaction',
    timedOut: (label: string) =>
      `${label} timed out. Signature request took too long. You can try again.`,
    cancelled: (label: string) => `${label} signature cancelled.`,
    failedRetryable: (label: string, detail: string) =>
      `${label} failed: ${detail} You can try again.`,
    failed: (label: string, detail: string) => `${label} failed: ${detail}`,
  },

  /** Empty lists, wallet gates, and the headings that introduce them. */
  empty: {
    loanProposals: 'No loan proposals yet.',
    treasuryWithdrawals: 'No treasury withdrawals yet.',
    adminEvents: 'No admin/governance events indexed yet.',
    notifications: 'No notifications yet',
    noDocument: 'No document attached yet.',
    partialLoad: (what: string) =>
      `Some ${what} couldn't be loaded and are missing from this list. Try again shortly.`,
    walletNotConnected: 'Wallet Not Connected',
    connectHeading: 'Connect Your Wallet',
    gates: {
      dashboard: 'Connect your wallet to access the member dashboard',
      governance: 'Please connect your wallet to access governance.',
      treasury: 'Please connect your wallet to access the treasury.',
      admin: 'Please connect your wallet to access the admin panel.',
      privacy: 'Please connect your wallet to view privacy features.',
      register: 'Connect your wallet to register for DAO membership',
      staking: 'You must be a DAO member to stake.',
      memberOnlyTitle: 'Member Only',
      memberOnlyBody: 'Only DAO members can create governance proposals.',
      accessDashboard: 'Access Dashboard',
      accessRestricted: 'Access Restricted',
      accessDenied: 'Access Denied',
    },
  },

  /** Standalone outcome toasts (successes and one-shot errors). */
  toasts: {
    registrationSuccess: 'Registration successful! Welcome to the DAO!',
    registrationFailed: 'Registration failed. Please try again.',
    rewardsClaimed: 'Rewards claimed successfully!',
    loanRequestSubmitted: 'Loan request submitted successfully!',
    loanDocumentAttachFailed:
      'Your loan request was submitted, but attaching the document failed. You can retry from the loan page.',
    loanNotFound: 'Loan not found',
  },

  /** Upload / download / decryption (ipfs.ts, DocumentUpload, useDocument). */
  documents: {
    filesTooLarge: (maxSize: number, files: string) =>
      `Some files exceed the ${maxSize}MB limit: ${files}`,
    selectFiles: 'Please select files to upload',
    passwordRequired: 'Password is required for encrypted uploads',
    uploadFailed: 'Upload failed',
    decryptPasswordRequired: 'Password is required to decrypt this doc',
    accessDenied: 'You do not have permission to view this doc',
    loadFailed: 'Failed to load doc',
    uploadRejected: (status: number) => `Document upload failed (${status})`,
    gatewayFetchFailed: (status: number) =>
      `Failed to fetch document from IPFS gateway (${status})`,
    noGateway: 'No IPFS gateway configured',
  },
} as const

/**
 * Presentation policy for backend error payloads (see docs/messages.md).
 *
 * The backend may answer `{ error, correlationId }`. The policy is:
 *
 * - The user sees the backend's `error` sentence when it has one — it is
 *   already written for humans — otherwise `fallback` (a message from
 *   `MESSAGES` at the call site).
 * - The `correlationId` never reaches the UI; it is logged so support can
 *   match a member's screenshot to a server log.
 * - Raw payloads (JSON bodies, `[object Object]`) are never shown verbatim:
 *   anything that isn't a plain string falls back.
 */
export function presentBackendError(payload: unknown, fallback: string): string {
  if (payload && typeof payload === 'object') {
    const { error, correlationId } = payload as {
      error?: unknown
      correlationId?: unknown
    }
    if (typeof correlationId === 'string' && correlationId) {
      console.warn('[backend-error]', correlationId)
    }
    if (typeof error === 'string' && error.trim()) {
      return error.trim()
    }
    return fallback
  }
  if (typeof payload === 'string' && payload.trim()) {
    return payload.trim()
  }
  return fallback
}
