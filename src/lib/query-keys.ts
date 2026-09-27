import type { QueryKey } from '@tanstack/react-query'

type Address = string
type ProposalKind = 'Loan' | 'Treasury'

export const queryKeys = {
  backendStats: () => ['backendStats'] as const,
  userData: (address: Address) => ['userData', address] as const,
  userDataDisabled: () => ['userData', null] as const,
  userLoans: (address: Address) => ['userLoans', address] as const,
  userLoansDisabled: () => ['userLoans', null] as const,
  loanPolicy: () => ['loanPolicy'] as const,
  loanTerms: (amount: bigint) => ['loanTerms', amount.toString()] as const,
  daoStats: () => ['daoStats'] as const,
  daoStatsBackend: () => ['daoStatsBackend'] as const,
  daoEvents: () => ['daoEvents'] as const,
  loanProposals: (count: number) => ['loanProposals', count] as const,
  loanProposalsAll: () => ['loanProposals'] as const,
  hasVoted: (kind: ProposalKind, proposalId: number, address: Address) =>
    ['hasVoted', kind, proposalId, address] as const,
  hasVotedDisabled: (kind: ProposalKind, proposalId: number) =>
    ['hasVoted', kind, proposalId, null] as const,
  loanProposal: (id: number) => ['loanProposal', id] as const,
  loan: (id: number) => ['loan', id] as const,
  treasuryProposals: (count: number) => ['treasuryProposals', count] as const,
  treasuryProposalsAll: () => ['treasuryProposals'] as const,
  stake: (address: Address) => ['stake', address] as const,
  stakeDisabled: () => ['stake', null] as const,
  proposalDocument: (kind: ProposalKind, id: number) => ['document', kind, id] as const,
  admins: () => ['admins'] as const,
  adminLog: (limit: number) => ['adminLog', limit] as const,
  document: (hash: string, address: Address) => ['document', hash, address] as const,
  notifications: (address: Address) => ['notifications', address] as const,
  notificationsDisabled: () => ['notifications', null] as const,
  activity: (limit: number) => ['activity', limit] as const,
}

export const allWalletScopedQueryKeys = (): QueryKey[] => [
  ['userData'],
  ['userLoans'],
  ['hasVoted'],
  ['stake'],
  ['document'],
  ['notifications'],
]