'use client'

/**
 * Soroban client for the OurDAO contract.
 *
 * `read` simulates a contract call and decodes the result (no wallet needed).
 * `invoke` prepares, signs (via Freighter), submits, and polls a state-changing
 * call. Typed wrappers below mirror the Rust contract's public interface.
 *
 * All RPC calls are bounded by explicit timeouts so a hung Soroban RPC cannot
 * leave a query pending indefinitely. Reads and writes have separate budgets
 * because a write legitimately takes longer.
 */
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  FeeBumpTransaction,
  Keypair,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
  xdr,
} from '@stellar/stellar-sdk'
import {
  CONTRACT_ID,
  NETWORK_PASSPHRASE,
  getTransactionUrl,
  isContractConfigured,
  server,
} from './stellar'
import { formatContractError } from './contract-errors'

// Multiplier for inclusion fee to survive network congestion.
// The inclusion fee (stroops/byte) is what validators use to order transactions
// when the ledger is full. BASE_FEE (100 stroops) is the protocol floor, not a
// recommended value. This multiplier ensures submissions carry headroom above the
// floor, preventing silent drops when competing with higher-fee transactions.
// Note: This is distinct from Soroban's resource fee, which prepareTransaction
// computes separately and adds on top of this inclusion fee.
const INCLUSION_FEE_MULTIPLIER = 1.5
// TransactionBuilder takes the fee as a string of stroops, and BASE_FEE is
// itself a string, so it must be coerced before the multiplication.
const INCLUSION_FEE = String(Math.ceil(Number(BASE_FEE) * INCLUSION_FEE_MULTIPLIER))

// ---------------------------------------------------------------------------
// Timeout configuration
// ---------------------------------------------------------------------------

/** Timeout for read-only RPC calls (simulateTransaction). */
export const READ_TIMEOUT_MS = 10_000

/** Timeout for write RPC calls (getAccount, prepareTransaction, sendTransaction, getTransaction). */
export const WRITE_TIMEOUT_MS = 60_000

/** Creates a promise that rejects after the given timeout. */
export function timeout<T>(ms: number, label: string): Promise<T> {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  })
}

/** Wraps a promise with a timeout, preserving the original error type when possible. */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  try {
    return await Promise.race([promise, timeout<T>(ms, label)])
  } catch (e) {
    if (e instanceof Error && e.message.includes('timed out')) {
      const timeoutError = new Error(e.message)
      // Mark as retryable so the UI can offer a retry
      ;(timeoutError as Error & { retryable: boolean }).retryable = true
      throw timeoutError
    }
    throw e
  }
}

// ---------------------------------------------------------------------------
// ScVal argument builders (JS value -> Soroban value with the right type)
// ---------------------------------------------------------------------------

export const sc = {
  addr: (a: string): xdr.ScVal => new Address(a).toScVal(),
  i128: (v: bigint | number | string): xdr.ScVal =>
    nativeToScVal(BigInt(v), { type: 'i128' }),
  u32: (v: number): xdr.ScVal => nativeToScVal(v, { type: 'u32' }),
  u64: (v: bigint | number): xdr.ScVal =>
    nativeToScVal(BigInt(v), { type: 'u64' }),
  // Booleans map unambiguously to scvBool; nativeToScVal needs no type hint
  // (there's no 'bool' entry in its ScValType union at all).
  bool: (v: boolean): xdr.ScVal => nativeToScVal(v),
  str: (v: string): xdr.ScVal => nativeToScVal(v, { type: 'string' }),
  bytes: (v: Uint8Array): xdr.ScVal => xdr.ScVal.scvBytes(v as Buffer),
  vecAddr: (list: string[]): xdr.ScVal =>
    xdr.ScVal.scvVec(list.map((a) => new Address(a).toScVal())),
  // ProposalKind is a unit-variant enum: encoded as a single-symbol vector.
  proposalKind: (kind: 'Loan' | 'Treasury'): xdr.ScVal =>
    xdr.ScVal.scvVec([xdr.ScVal.scvSymbol(kind)]),
}

export interface LoanPolicyInput {
  minMembershipDuration: number | bigint
  membershipContribution: bigint | number | string
  maxLoanDuration: number | bigint
  minInterestRate: number
  maxInterestRate: number
  cooldownPeriod: number | bigint
  maxLoanToTreasuryRatio: number
  defaultGracePeriod: number | bigint
  defaultPenaltyBps: number
}

export function policyToScVal(p: LoanPolicyInput): xdr.ScVal {
  return nativeToScVal(
    {
      min_membership_duration: BigInt(p.minMembershipDuration),
      membership_contribution: BigInt(p.membershipContribution),
      max_loan_duration: BigInt(p.maxLoanDuration),
      min_interest_rate: p.minInterestRate,
      max_interest_rate: p.maxInterestRate,
      cooldown_period: BigInt(p.cooldownPeriod),
      max_loan_to_treasury_ratio: p.maxLoanToTreasuryRatio,
      default_grace_period: BigInt(p.defaultGracePeriod),
      default_penalty_bps: p.defaultPenaltyBps,
    },
    {
      type: {
        min_membership_duration: ['symbol', 'u64'],
        membership_contribution: ['symbol', 'i128'],
        max_loan_duration: ['symbol', 'u64'],
        min_interest_rate: ['symbol', 'u32'],
        max_interest_rate: ['symbol', 'u32'],
        cooldown_period: ['symbol', 'u64'],
        max_loan_to_treasury_ratio: ['symbol', 'u32'],
        default_grace_period: ['symbol', 'u64'],
        default_penalty_bps: ['symbol', 'u32'],
      },
    }
  )
}

// ---------------------------------------------------------------------------
// Core read / invoke
// ---------------------------------------------------------------------------

/** Simulate a read-only call and decode the return value. Returns null when no
 * contract is configured or the call yields no value. */
export async function read<T = unknown>(
  method: string,
  ...args: xdr.ScVal[]
): Promise<T | null> {
  if (!isContractConfigured()) return null

  const contract = new Contract(CONTRACT_ID)
  // Simulation needs a source account but never touches it on-chain; a throwaway
  // keypair is generated per read even though a fixed placeholder would do.
  const source = new Account(Keypair.random().publicKey(), '0')
  const tx = new TransactionBuilder(source, {
    fee: INCLUSION_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(30)
    .build()

  const sim = await withTimeout(server.simulateTransaction(tx), READ_TIMEOUT_MS, 'simulateTransaction')
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(formatContractError(sim.error))
  }
  const retval = sim.result?.retval
  return retval ? (scValToNative(retval) as T) : null
}

export interface InvokeResult {
  hash: string
  returnValue: unknown
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const POLL_INTERVAL_MS = 1000
/** Fallback poll budget when a signed transaction carries no time bounds
 * (shouldn't happen — `.setTimeout(30)` always sets one — but a hardcoded
 * cap is cheap insurance against polling forever). */
const DEFAULT_POLL_BUDGET_MS = 30_000

/**
 * How long a background {@link watchTransaction} keeps checking after
 * `invoke`'s submission window closed. Generous on purpose: this is the window
 * in which a late confirmation is still worth telling the member about, and it
 * costs nothing but an occasional `getTransaction` every few seconds.
 */
const BACKGROUND_WATCH_BUDGET_MS = 5 * 60_000

/**
 * Bounded resubmission for `TRY_AGAIN_LATER` (#309).
 *
 * `TRY_AGAIN_LATER` means the node declined to queue the transaction at all —
 * typically because its mempool is full. Nothing was submitted, so there is
 * nothing to poll and nothing to lose by trying again. The right response is to
 * wait out the congestion and resubmit, not to hand the member an error and
 * make them click.
 *
 * The bound matters as much as the retry: an unbounded retry against a
 * permanently saturated network would spin forever while the member stares at a
 * loading spinner. Three attempts with linear backoff (1s, 2s, 3s) is enough to
 * ride out a normal burst and then gives up honestly.
 */
const RESUBMIT_MAX_ATTEMPTS = 3
const RESUBMIT_BASE_BACKOFF_MS = 1_000

/**
 * A submission/confirmation failure from {@link invoke}, distinct from a
 * decoded on-chain contract error.
 *
 * `retryable` is true when resubmitting the exact same signed transaction
 * (or a fresh one, for `TRY_AGAIN_LATER`) has a real chance of succeeding —
 * a transient RPC-node condition rather than something the transaction
 * itself is wrong about — so the UI can offer a "Try again" affordance
 * instead of just surfacing the message (#58).
 */
export class InvokeError extends Error {
  readonly retryable: boolean

  constructor(message: string, opts: { retryable?: boolean } = {}) {
    super(message)
    this.name = 'InvokeError'
    this.retryable = opts.retryable ?? false
  }
}

/**
 * The submission window closed while the transaction was still unconfirmed.
 *
 * This is deliberately **not** an {@link InvokeError}, and specifically not a
 * retryable one. The transaction was accepted by the network and may still
 * land — `retryable: true` here would invite the member to resubmit a change
 * that might already be applied, which for a vote or a withdrawal is a real
 * cost. So this type carries the two things a UI needs to do the right thing:
 *
 *   - `hash` / `url` — so the member can check the transaction themselves, or
 *     follow it to an explorer, instead of being told to guess.
 *   - `retryable === false` — so the "Try again" affordance is not offered.
 *
 * `useWriteAction` catches this, keeps a background poll running via
 * {@link watchTransaction}, and upgrades the UI to "confirmed" if the
 * transaction does land after the window closed. See #309.
 */
export class TransactionPendingError extends Error {
  /** The submitted transaction's hash. Stable across confirmations. */
  readonly hash: string
  /**
   * Explorer link for {@link hash}, for the member to verify independently.
   * Null when the hash is empty, which the network would not have produced —
   * the message then falls back to naming the hash alone.
   */
  readonly url: string | null
  /** Always false: resubmitting could double-apply the change. */
  readonly retryable = false

  constructor(hash: string, url: string | null) {
    super(
      `Transaction ${hash} was submitted but not confirmed before its submission ` +
        `window closed. It may still complete — do not resubmit. ` +
        (url ? `Check ${url} for its status.` : 'Check its status on a Stellar explorer.')
    )
    this.name = 'TransactionPendingError'
    this.hash = hash
    this.url = url
  }
}


/**
 * Keep checking a submitted transaction after {@link invoke} has given up
 * waiting for it, so a late confirmation can still be reported as a success
 * rather than a failure.
 *
 * `invoke`'s poll is bounded by the transaction's own `timeBounds`, which is a
 * submission window, not a confirmation guarantee — closing it does not mean
 * the transaction was rejected. This is the reconciliation pass for that gap.
 *
 * Resolves on confirmation, on a terminal on-chain failure, or when `timeoutMs`
 * elapses without either; it never rejects, because there is no useful thing
 * for a caller to do with a background poll's failure beyond stopping.
 */
export async function watchTransaction(
  hash: string,
  handlers: {
    onConfirmed?: (returnValue: unknown) => void
    onFailed?: (status: string) => void
    /** Give up on the background watch after this long. Default 5 minutes. */
    timeoutMs?: number
  } = {}
): Promise<'confirmed' | 'failed' | 'timeout'> {
  const { onConfirmed, onFailed, timeoutMs = BACKGROUND_WATCH_BUDGET_MS } = handlers
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS)
    try {
      const result = await withTimeout(
        server.getTransaction(hash),
        WRITE_TIMEOUT_MS,
        'getTransaction'
      )
      if (result.status === 'SUCCESS') {
        const confirmed = result as { returnValue?: xdr.ScVal }
        onConfirmed?.(
          confirmed.returnValue ? scValToNative(confirmed.returnValue) : null
        )
        return 'confirmed'
      }
      if (result.status !== 'NOT_FOUND') {
        onFailed?.(String(result.status))
        return 'failed'
      }
    } catch {
      // A transient RPC failure during background reconciliation is not
      // itself a verdict on the transaction. Keep polling until the budget
      // runs out; the final `timeout` is the honest answer.
    }
  }
  return 'timeout'
}

/** Prepare, sign, submit, and confirm a state-changing call. */
export async function invoke(
  walletAddress: string,
  signXDR: (xdr: string) => Promise<string>,
  method: string,
  ...args: xdr.ScVal[]
): Promise<InvokeResult> {
  if (!isContractConfigured()) {
    throw new Error('No contract configured (set NEXT_PUBLIC_CONTRACT_ID).')
  }

  const contract = new Contract(CONTRACT_ID)

  // One submission attempt: a *fresh* account read, build, simulate, sign, and
  // send. Rebuilt from scratch on every attempt because a resubmission has to
  // carry a new sequence number and a refreshed simulation — replaying a stale
  // signed transaction would come back as a bad-sequence error instead of the
  // congestion signal we are responding to (#309).
  // Assigned by submitOnce before the poll below reads it.
  let signed!: Transaction | FeeBumpTransaction

  const submitOnce = async () => {
    const account = await withTimeout(
      server.getAccount(walletAddress),
      WRITE_TIMEOUT_MS,
      'getAccount'
    )
    const built = new TransactionBuilder(account, {
      fee: INCLUSION_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build()

    // Simulate + assemble auth entries and resource footprint.
    const prepared = await withTimeout(
      server.prepareTransaction(built),
      WRITE_TIMEOUT_MS,
      'prepareTransaction'
    )
    const signedXdr = await signXDR(prepared.toXDR())
    signed = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE)

    return withTimeout(server.sendTransaction(signed), WRITE_TIMEOUT_MS, 'sendTransaction')
  }

  // Resubmit across a congested network, bounded (#309). `TRY_AGAIN_LATER` means
  // the node never queued anything, so there is nothing to poll and nothing to
  // double-apply — waiting out the congestion and resending is strictly better
  // than handing the member an error to click. The bound matters as much as the
  // retry: each attempt costs a signature prompt, and an unbounded loop against
  // a permanently saturated network would just spin behind a spinner.
  let sent!: Awaited<ReturnType<typeof server.sendTransaction>>
  for (let attempt = 1; attempt <= RESUBMIT_MAX_ATTEMPTS; attempt++) {
    sent = await submitOnce()
    if (sent.status !== 'TRY_AGAIN_LATER') break
    if (attempt < RESUBMIT_MAX_ATTEMPTS) {
      // Linear backoff: congestion clears on a human timescale, and the member
      // is not being asked to click anything.
      await sleep(RESUBMIT_BASE_BACKOFF_MS * attempt)
    }
  }
  const sentHash = sent.hash

  // Every `sendTransaction` status gets an explicit branch (#58) — the old
  // code only checked for 'ERROR' and let PENDING, DUPLICATE, and
  // TRY_AGAIN_LATER all fall through identically into the confirmation
  // poll below, even though TRY_AGAIN_LATER means the node never queued
  // the transaction at all: there is nothing to poll for, and polling
  // anyway just spends 30s finding out NOT_FOUND before reporting the
  // wrong cause.
  switch (sent.status) {
    case 'ERROR':
      throw new InvokeError(formatContractError(JSON.stringify(sent.errorResult)), {
        retryable: false,
      })
    case 'TRY_AGAIN_LATER':
      // The resubmission budget is spent, so the network really is saturated.
      // Nothing was queued, which makes this safe to retry — and the only
      // honest thing left is to tell the member.
      throw new InvokeError(
        `The network is busy and did not accept this transaction after ${RESUBMIT_MAX_ATTEMPTS} attempts. Please try again in a moment.`,
        { retryable: true }
      )
    case 'DUPLICATE':
      // Already queued by an earlier identical submission (e.g. a double
      // click) — poll for the hash that's already in flight rather than
      // treating this as a fresh failure or silently rebuilding/resending.
      break
    case 'PENDING':
      break
    default:
      // Exhaustiveness guard: a status the SDK's type union doesn't (yet)
      // name is safer surfaced as an explicit error than silently falling
      // into the poll below.
      throw new InvokeError(`Unexpected submission status: ${String(sent.status)}`, {
        retryable: false,
      })
  }

  // Poll until the transaction's own time bounds expire rather than a
  // hardcoded iteration count, so the poll budget always matches the
  // window during which the network could actually still include it.
  // FeeBumpTransaction has no timeBounds of its own (only its inner
  // Transaction does), so fall back to the default budget for those.
  const deadlineMs =
    signed instanceof Transaction && signed.timeBounds?.maxTime
      ? Number(signed.timeBounds.maxTime) * 1000
      : Date.now() + DEFAULT_POLL_BUDGET_MS

  let result = await withTimeout(
    server.getTransaction(sentHash),
    WRITE_TIMEOUT_MS,
    'getTransaction'
  )
  while (result.status === 'NOT_FOUND' && Date.now() < deadlineMs) {
    await sleep(POLL_INTERVAL_MS)
    result = await withTimeout(
      server.getTransaction(sentHash),
      WRITE_TIMEOUT_MS,
      'getTransaction'
    )
  }

  if (result.status === 'NOT_FOUND') {
    // Not a failure: the transaction was accepted and may still land, so this
    // throws the non-retryable pending error (hash + explorer link) and lets
    // `useWriteAction` reconcile in the background rather than telling the
    // member to resubmit something that might already be applied (#309).
    throw new TransactionPendingError(sentHash, getTransactionUrl(sentHash))
  }
  if (result.status !== 'SUCCESS') {
    throw new InvokeError(`Transaction ${sentHash} failed on-chain (${result.status}).`, {
      retryable: false,
    })
  }
  const confirmed = result as { returnValue?: xdr.ScVal }
  return {
    hash: sentHash,
    returnValue: confirmed.returnValue ? scValToNative(confirmed.returnValue) : null,
  }
}

// ---------------------------------------------------------------------------
// Typed read wrappers (mirror the Rust contract views)
// ---------------------------------------------------------------------------

export const daoRead = {
  getTotalMembers: () => read<number>('get_total_members'),
  getActiveMembers: () => read<number>('get_active_members'),
  getConsensusThreshold: () => read<number>('get_consensus_threshold'),
  getTreasuryBalance: () => read<bigint>('get_treasury_balance'),
  getLoanPolicy: () => read<Record<string, unknown>>('get_loan_policy'),
  getToken: () => read<string>('get_token'),
  isPaused: () => read<boolean>('is_paused'),
  getAdmins: () => read<string[]>('get_admins'),
  isMember: (addr: string) => read<boolean>('is_member', sc.addr(addr)),
  isAdmin: (addr: string) => read<boolean>('is_admin', sc.addr(addr)),
  isEligibleForLoan: (addr: string) =>
    read<boolean>('is_eligible_for_loan', sc.addr(addr)),
  getMember: (addr: string) =>
    read<Record<string, unknown> | null>('get_member', sc.addr(addr)),
  getPendingYield: (addr: string) =>
    read<bigint>('get_pending_yield', sc.addr(addr)),
  getStake: (addr: string) => read<bigint>('get_stake', sc.addr(addr)),
  getLoan: (id: number) => read<Record<string, unknown> | null>('get_loan', sc.u32(id)),
  getLoanProposal: (id: number) =>
    read<Record<string, unknown> | null>('get_loan_proposal', sc.u32(id)),
  getTreasuryProposal: (id: number) =>
    read<Record<string, unknown> | null>('get_treasury_proposal', sc.u32(id)),
  calculateLoanTerms: (amount: bigint | number) =>
    read<Record<string, unknown>>('calculate_loan_terms', sc.i128(amount)),
  calculateExitShare: (addr: string) =>
    read<bigint>('calculate_exit_share', sc.addr(addr)),
  resolveName: (name: string) => read<string | null>('resolve_name', sc.str(name)),
  nameOf: (addr: string) => read<string | null>('name_of', sc.addr(addr)),
  getDocument: (kind: 'Loan' | 'Treasury', id: number) =>
    read<Uint8Array | null>('get_document', sc.proposalKind(kind), sc.u32(id)),
  // For a private (commit-reveal) treasury proposal this is true as soon as
  // `voter` has committed, not only once revealed — the contract folds both
  // into one bool since a commitment already blocks a second vote. There is
  // no separate view to tell "committed, not yet revealed" apart from
  // "fully voted".
  hasVoted: (kind: 'Loan' | 'Treasury', proposalId: number, voter: string) =>
    read<boolean>('has_voted', sc.proposalKind(kind), sc.u32(proposalId), sc.addr(voter)),
}

// ---------------------------------------------------------------------------
// Typed write wrappers — bound to a connected wallet + signer
// ---------------------------------------------------------------------------

export function daoWrite(
  address: string,
  signXDR: (xdr: string) => Promise<string>
) {
  const send = (method: string, ...args: xdr.ScVal[]) =>
    invoke(address, signXDR, method, ...args)

  return {
    registerMember: () => send('register_member', sc.addr(address)),
    exitDao: () => send('exit_dao', sc.addr(address)),
    claimRewards: () => send('claim_rewards', sc.addr(address)),

    requestLoan: (amount: bigint | number) =>
      send('request_loan', sc.addr(address), sc.i128(amount)),
    editLoanProposal: (proposalId: number, newAmount: bigint | number) =>
      send('edit_loan_proposal', sc.addr(address), sc.u32(proposalId), sc.i128(newAmount)),
    voteOnLoanProposal: (proposalId: number, support: boolean) =>
      send('vote_on_loan_proposal', sc.addr(address), sc.u32(proposalId), sc.bool(support)),
    repayLoan: (loanId: number) =>
      send('repay_loan', sc.addr(address), sc.u32(loanId)),
    // Partial repayment — amount is applied to accrued interest first, then
    // principal; the interest portion is distributed to active members as
    // yield immediately (see contracts/dao/src/loans.rs). Rejects amount
    // <= 0 or amount > outstanding balance.
    repayLoanPartial: (loanId: number, amount: bigint | number) =>
      send('repay_loan_partial', sc.addr(address), sc.u32(loanId), sc.i128(amount)),
    // Permissionless: the contract takes no caller argument (anyone can
    // trigger this once a loan is overdue past its grace period).
    markLoanDefaulted: (loanId: number) => send('mark_loan_defaulted', sc.u32(loanId)),

    proposeTreasuryWithdrawal: (
      amount: bigint | number,
      destination: string,
      reason: string,
      isPrivate: boolean
    ) =>
      send(
        'propose_treasury_withdrawal',
        sc.addr(address),
        sc.i128(amount),
        sc.addr(destination),
        sc.str(reason),
        sc.bool(isPrivate)
      ),
    voteOnTreasuryProposal: (proposalId: number, support: boolean) =>
      send('vote_on_treasury_proposal', sc.addr(address), sc.u32(proposalId), sc.bool(support)),

    stake: (amount: bigint | number) =>
      send('stake', sc.addr(address), sc.i128(amount)),
    unstake: (amount: bigint | number) =>
      send('unstake', sc.addr(address), sc.i128(amount)),

    registerName: (name: string) =>
      send('register_name', sc.addr(address), sc.str(name)),

    commitTreasuryVote: (proposalId: number, commitment: Uint8Array) =>
      send('commit_treasury_vote', sc.addr(address), sc.u32(proposalId), sc.bytes(commitment)),
    revealTreasuryVote: (proposalId: number, support: boolean, salt: Uint8Array) =>
      send(
        'reveal_treasury_vote',
        sc.addr(address),
        sc.u32(proposalId),
        sc.bool(support),
        sc.bytes(salt)
      ),

    attachDocument: (kind: 'Loan' | 'Treasury', proposalId: number, contentHash: Uint8Array) =>
      send('attach_document', sc.addr(address), sc.proposalKind(kind), sc.u32(proposalId), sc.bytes(contentHash)),

    // Admin-only entrypoints. The contract itself enforces the admin check
    // (`util::require_admin`) — `address` here is the connected wallet acting
    // as `caller`, not necessarily an admin; a non-admin call simply fails
    // on-chain with NotAdmin.
    addAdmin: (admin: string) => send('add_admin', sc.addr(address), sc.addr(admin)),
    removeAdmin: (admin: string) => send('remove_admin', sc.addr(address), sc.addr(admin)),
    setConsensusThreshold: (thresholdBps: number) =>
      send('set_consensus_threshold', sc.addr(address), sc.u32(thresholdBps)),
    setLoanPolicy: (policy: LoanPolicyInput) =>
      send('set_loan_policy', sc.addr(address), policyToScVal(policy)),
    pause: () => send('pause', sc.addr(address)),
    unpause: () => send('unpause', sc.addr(address)),
  }
}

export type DaoWrite = ReturnType<typeof daoWrite>
