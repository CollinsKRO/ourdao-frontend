'use client'

import { useQuery } from '@tanstack/react-query'
import { useWallet } from '@/lib/wallet'
import { CONTRACT_ID, isContractConfigured } from '@/lib/stellar'
import { daoRead } from '@/lib/dao-client'
import { backend } from '@/lib/backend'
import type { UserData, DAOStats } from '@/types/dao'
import { asBigInt, resolveLoanPolicy, toLoan, toMemberStatus } from '@/lib/dao-mappers'
import type { UILoanPolicy } from '@/lib/dao-mappers'
import { queryKeys } from '@/lib/query-keys'
import { QUERY_REFRESH_INTERVAL_MS } from '@/constants'

function isBackendConfigured(): boolean {
  if (backend && typeof (backend as { isConfigured?: () => boolean }).isConfigured === 'function') {
    return (backend as { isConfigured: () => boolean }).isConfigured()
  }
  if (process.env.NEXT_PUBLIC_BACKEND_URL === '') return false
  if (process.env.NEXT_PUBLIC_BACKEND_URL) return true
  return process.env.NODE_ENV === 'test' && !!backend
}

export function useDAOContract() {
  return { contractId: CONTRACT_ID, configured: isContractConfigured() }
}

/** Aggregated data for the connected member. */
export function useUserData(): UserData {
  const { address, isConnected } = useWallet()

  const { data, isLoading, isError, refetch: refetchUser } = useQuery({
    queryKey: address ? queryKeys.userData(address) : queryKeys.userDataDisabled(),
    enabled: !!address && isContractConfigured(),
    queryFn: async () => {
      const [isMember, isAdmin, member, pendingYield, exitShare] = await Promise.all([
        daoRead.isMember(address!),
        daoRead.isAdmin(address!),
        daoRead.getMember(address!),
        daoRead.getPendingYield(address!),
        daoRead.calculateExitShare ? daoRead.calculateExitShare(address!).catch(() => null) : Promise.resolve(null),
      ])
      return { isMember, isAdmin, member, pendingYield, exitShare }
    },
  })

  const isMember = !!data?.isMember
  const backendConfigured = isBackendConfigured()

  // Loan history comes from the off-chain indexer (the contract keeps no
  // queryable per-member loan list).
  // Issue #242: Gated on backend configuration and membership:
  // - If backend is unconfigured, do not poll.
  // - A connected non-member does not poll for loan history (when contract is configured).
  const { data: loans, isError: loansError, refetch: refetchLoans } = useQuery({
    queryKey: address ? queryKeys.userLoans(address) : queryKeys.userLoansDisabled(),
    enabled: !!address && backendConfigured && (!isContractConfigured() || isMember),
    queryFn: () => backend.getLoans(address!),
    refetchInterval: () => {
      if (!backendConfigured || !isMember) return false
      return QUERY_REFRESH_INTERVAL_MS
    },
    refetchIntervalInBackground: false,
  })

  const m = data?.member
  return {
    isConnected,
    isLoading,
    address: address || undefined,
    isMember: !!data?.isMember,
    isAdmin: !!data?.isAdmin,
    member: m
      ? {
          memberAddress: String(m.address ?? address),
          status: toMemberStatus(m.status),
          joinDate: Number(m.join_ledger ?? 0),
          contributionAmount: asBigInt(m.contribution),
          // Member.share_balance in ourdao-contracts is a dead field (only set at join/exit, never updated).
          // Paired contract issue: https://github.com/Mikey-222/ourdao-contracts/issues/42
          // We query daoRead.calculateExitShare(address) to compute the member's live treasury claim.
          shareBalance: asBigInt(data?.exitShare ?? m.share_balance),
          hasActiveLoan: !!m.has_active_loan,
          lastLoanDate: Number(m.last_loan_time ?? 0),
        }
      : undefined,
    votingWeight: 1,
    pendingRewards: asBigInt(data?.pendingYield),
    pendingYield: asBigInt(data?.pendingYield),
    hasActiveLoan: !!m?.has_active_loan,
    loans: (loans ?? []).map(toLoan),
    isError,
    loansError,
    refetch: () => {
      if (isError) void refetchUser()
      if (loansError) void refetchLoans()
    },
  }
}

export type ExtendedStats = DAOStats & {
  initialized: boolean
  isPaused: boolean
  membershipFee: bigint
  /** Policy cap on a loan as basis points of the treasury balance. */
  maxLoanToTreasuryRatio: number
  consensusThreshold: number
  indexerStale: boolean
  /** A stats read failed, so the figures below are defaults, not the DAO's real numbers. */
  isError: boolean
  refetch: () => void
  secondsSinceUpdate: number | null
  interestCollected: string
  principalLent: string
  principalRepaid: string
  valueDefaulted: string
  defaultedLoans: number
  totalDefaultedValue: string
  features: {
    ensVoting: boolean
    documentStorage: boolean
    privateVoting: boolean
    confidentialLoans: boolean
    restaking: boolean
  }
}

/** The loan policy as the contract currently has it. An admin can change it at
 *  any time, so it is refetched rather than cached forever; until the first
 *  read lands the labelled fallbacks stand in (`fromChain` is false). */
export function useLoanPolicy(): UILoanPolicy {
  const { data } = useQuery({
    queryKey: queryKeys.loanPolicy(),
    enabled: isContractConfigured(),
    queryFn: async () => {
      const [policy, threshold] = await Promise.all([
        daoRead.getLoanPolicy(),
        daoRead.getConsensusThreshold(),
      ])
      return { policy, threshold }
    },
  })
  return resolveLoanPolicy(data?.policy, data?.threshold)
}

export function useDAOStats(): ExtendedStats {
  const { data, isError: contractError, refetch: refetchContract } = useQuery({
    queryKey: queryKeys.daoStats(),
    enabled: isContractConfigured(),
    queryFn: async () => {
      const [totalMembers, activeMembers, threshold, treasury, policy, isPaused] =
        await Promise.all([
          daoRead.getTotalMembers(),
          daoRead.getActiveMembers(),
          daoRead.getConsensusThreshold(),
          daoRead.getTreasuryBalance(),
          daoRead.getLoanPolicy(),
          daoRead.isPaused(),
        ])
      return { totalMembers, activeMembers, threshold, treasury, policy, isPaused }
    },
  })

  // Loan counts and total stake are aggregated by the off-chain indexer, which
  // sees the full event history the contract doesn't keep queryable.
  const backendConfigured = isBackendConfigured()
  const { data: agg, isError: indexerError, refetch: refetchIndexer } = useQuery({
    queryKey: queryKeys.daoStatsBackend(),
    enabled: backendConfigured,
    queryFn: () => backend.getStats(),
    refetchInterval: backendConfigured ? QUERY_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  })

  const membershipFee = asBigInt(
    (data?.policy as Record<string, unknown> | undefined)?.membership_contribution
  )

  const maxLoanToTreasuryRatio = Number(
    (data?.policy as Record<string, unknown> | undefined)?.max_loan_to_treasury_ratio ?? 0
  )

  return {
    totalMembers: Number(data?.totalMembers ?? 0),
    activeMembers: Number(data?.activeMembers ?? 0),
    totalLoans: agg?.totalLoans ?? 0,
    activeLoans: agg?.activeLoans ?? 0,
    treasuryBalance: asBigInt(data?.treasury),
    totalYieldGenerated: BigInt(0),
    totalRestaked: asBigInt(agg?.totalStaked),
    initialized: isContractConfigured() && data?.threshold != null,
    isPaused: !!data?.isPaused,
    membershipFee,
    maxLoanToTreasuryRatio,
    consensusThreshold: Number(data?.threshold ?? 0),
    indexerStale: agg?.indexerStale ?? false,
    isError: contractError || indexerError,
    refetch: () => {
      if (contractError) void refetchContract()
      if (indexerError) void refetchIndexer()
    },
    secondsSinceUpdate: agg?.secondsSinceUpdate ?? null,
    interestCollected: agg?.interestCollected ?? '0',
    principalLent: agg?.principalLent ?? '0',
    principalRepaid: agg?.principalRepaid ?? '0',
    valueDefaulted: agg?.valueDefaulted ?? '0',
    defaultedLoans: agg?.defaultedLoans ?? 0,
    totalDefaultedValue: agg?.totalDefaultedValue ?? '0',
    // The Soroban port's native modules are always compiled in.
    features: {
      ensVoting: true, // name registry
      documentStorage: true, // content-hash metadata
      privateVoting: true, // commit-reveal
      confidentialLoans: false,
      restaking: true, // staking
    },
  }
}

// Contract events, indexed off-chain by ourdao-backend (which polls the RPC's
// getEvents) and served from its raw event feed. Kept read-only; `setEvents`
// remains for call-site compatibility with the previous shell.
export function useDAOEvents() {
  const backendConfigured = isBackendConfigured()
  const { data, isError, refetch } = useQuery({
    queryKey: queryKeys.daoEvents(),
    enabled: backendConfigured,
    queryFn: () => backend.getEvents(50),
    refetchInterval: backendConfigured ? QUERY_REFRESH_INTERVAL_MS : false,
    refetchIntervalInBackground: false,
  })
  const events = (data ?? []) as unknown as Record<string, unknown>[]
  const setEvents = () => {}
  return { events, setEvents, isError, refetch }
}
