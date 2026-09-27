'use client'

import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import React from 'react'
import toast from 'react-hot-toast'
import { useWallet } from '@/lib/wallet'
import { getTransactionUrl } from '@/lib/stellar'
import { daoWrite, InvokeError, type InvokeResult } from '@/lib/dao-client'
import { queryKeys } from '@/lib/query-keys'
import { announce } from '@/lib/announce'

// Write-status toasts are visual only. Status is announced by <LiveAnnouncer>
// (src/lib/announce.ts): a toast is inserted with its content already in it,
// which screen readers do not reliably announce, and an in-place update by id
// would otherwise be announced a second time on top of ours. react-hot-toast
// applies its own aria defaults per toast, so this must be passed per call.
const SILENT_TOAST = { ariaProps: { role: 'status', 'aria-live': 'off' } } as const

type OptimisticUpdate = {
  queryKey: QueryKey
  update: (current: unknown) => unknown
}

/**
 * Shared plumbing for a write action: resolves the wallet + signer, tracks
 * pending/success/error, surfaces toasts, and invalidates the query keys the
 * action affects once the write is confirmed.
 */
export function useWriteAction() {
  const { address, signXDR, isConnected, networkMismatch } = useWallet()
  const queryClient = useQueryClient()
  const [isPending, setPending] = useState(false)
  const [isSuccess, setSuccess] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const [isRetryable, setRetryable] = useState(false)

  const abortControllerRef = useRef<AbortController | null>(null)
  const toastIdRef = useRef<string | null>(null)

  const cancelSignature = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current)
      toastIdRef.current = null
    }
    setPending(false)
    setError(new Error('Signature request cancelled'))
    setRetryable(true)
    toast.error('Signature request cancelled')
    announce('Signature request cancelled.', 'assertive')
  }, [])

  const run = useCallback(
    async (
      label: string,
      fn: (w: ReturnType<typeof daoWrite>) => Promise<InvokeResult>,
      invalidates: QueryKey[] = [],
      optimisticUpdates: OptimisticUpdate[] = []
    ) => {
      if (!isConnected || !address) {
        toast.error('Connect your wallet first')
        announce('Connect your wallet first.', 'assertive')
        throw new Error('Wallet not connected')
      }
      // Issue #241: block writes while the wallet is on the wrong network,
      // before any optimistic update or signer call, so a mismatched member
      // never reaches the Freighter approval prompt.
      if (networkMismatch) {
        toast.error('Wallet network mismatch: switch Freighter to the expected network before submitting.')
        throw new Error('Wallet network mismatch: transactions are blocked until the wallet network matches.')
      }
      setPending(true)
      setSuccess(false)
      setError(null)
      setRetryable(false)

      const toastId = toast.loading(`${label}…`, SILENT_TOAST)
      // Progress is polite: it must not interrupt whatever is being read.
      announce(`${label} in progress.`)
      toastIdRef.current = toastId

      const controller = new AbortController()
      abortControllerRef.current = controller
      const optimisticSnapshots = optimisticUpdates.map(({ queryKey, update }) => ({
        queryKey,
        previous: queryClient.getQueryData(queryKey),
        update,
      }))

      await Promise.all(
        optimisticUpdates.map(({ queryKey }) => queryClient.cancelQueries({ queryKey }))
      )
      for (const { queryKey, update } of optimisticSnapshots) {
        queryClient.setQueryData(queryKey, update)
      }

      const wrappedSignXDR = (xdr: string) =>
        signXDR(xdr, { signal: controller.signal })

      try {
        const res = await fn(daoWrite(address, wrappedSignXDR))
        setSuccess(true)
        announce(`${label} confirmed.`)
        toast.success(
          React.createElement(
            'span',
            null,
            `${label} confirmed `,
            React.createElement(
              'a',
              {
                href: getTransactionUrl(res.hash),
                target: '_blank',
                rel: 'noopener noreferrer',
                className: 'underline',
              },
              'View transaction'
            )
          ),
          { id: toastId, ...SILENT_TOAST }
        )
        for (const queryKey of invalidates) {
          queryClient.invalidateQueries({ queryKey })
        }
        return res
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        for (const { queryKey, previous } of optimisticSnapshots) {
          queryClient.setQueryData(queryKey, previous)
        }
        const isTimeout = e.message.includes('timed out')
        const isCancel = e.message.includes('cancelled')
        const isInvokeRetryable = e instanceof InvokeError && e.retryable

        const retryable = isTimeout || isCancel || isInvokeRetryable
        setError(e)
        setRetryable(retryable)

        // A failure interrupts (assertive); the same text is shown in the toast.
        let failure: string
        if (isTimeout) {
          failure = `${label} timed out. Signature request took too long. You can try again.`
        } else if (isCancel) {
          failure = `${label} signature cancelled.`
        } else if (retryable) {
          failure = `${label} failed: ${e.message} You can try again.`
        } else {
          failure = `${label} failed: ${e.message}`
        }
        toast.error(failure, { id: toastId, ...SILENT_TOAST })
        announce(failure, 'assertive')

        throw e
      } finally {
        setPending(false)
        abortControllerRef.current = null
        toastIdRef.current = null
      }
    },
    [address, isConnected, networkMismatch, signXDR, queryClient]
  )

  return { run, isPending, isSuccess, error, isRetryable, address, cancelSignature, networkMismatch }
}

export function useMemberRegistration() {
  const { run, isPending, isSuccess, error, address, cancelSignature } = useWriteAction()
  const registerMember = () =>
    run('Registering membership', (w) => w.registerMember(), [
      queryKeys.userData(address!),
      queryKeys.daoStats(),
    ])
  return { registerMember, isPending, error, isSuccess, cancelSignature }
}

export function useLoanRequest() {
  const { run, isPending, isSuccess, error, address, cancelSignature } = useWriteAction()
  const requestLoan = (amount: bigint) =>
    run('Requesting loan', (w) => w.requestLoan(amount), [
      queryKeys.backendStats(),
      queryKeys.userLoans(address!),
      queryKeys.userData(address!),
      queryKeys.loanProposalsAll(),
    ]).then(
      (res) => Number(res.returnValue)
    )
  return { requestLoan, isPending, error, isSuccess, cancelSignature }
}

export function useVoting() {
  const { run, isPending, isSuccess, error, address, cancelSignature } = useWriteAction()
  const voteOnProposal = (proposalId: number, support: boolean) =>
    run('Casting vote', (w) => w.voteOnLoanProposal(proposalId, support), [
      queryKeys.loanProposal(proposalId),
      queryKeys.loanProposalsAll(),
      queryKeys.hasVoted('Loan', proposalId, address!),
      queryKeys.daoStats(),
    ], [
      {
        queryKey: queryKeys.hasVoted('Loan', proposalId, address!),
        update: () => support,
      },
    ])
  return { voteOnProposal, isPending, error, isSuccess, cancelSignature }
}

export function useLoanRepayment() {
  const { run, isPending, isSuccess, error, address, cancelSignature } = useWriteAction()
  const repayLoan = (loanId: number, amount?: bigint) => {
    if (amount !== undefined) {
      if (amount <= BigInt(0)) throw new Error('Repayment amount must be greater than zero')
      return run('Repaying loan', (w) => w.repayLoanPartial(loanId, amount), [
        queryKeys.loan(loanId),
        queryKeys.userData(address!),
        queryKeys.daoStats(),
      ])
    }
    return run('Repaying loan', (w) => w.repayLoan(loanId), [
      queryKeys.loan(loanId),
      queryKeys.userData(address!),
      queryKeys.daoStats(),
    ])
  }
  const repayLoanPartial = (loanId: number, amount: bigint) => {
    if (amount <= BigInt(0)) throw new Error('Repayment amount must be greater than zero')
    return run('Repaying loan', (w) => w.repayLoanPartial(loanId, amount), [
      ['loan', loanId],
      ['userData', address],
      ['daoStats'],
    ])
  }
  return { repayLoan, repayLoanPartial, isPending, error, isSuccess, cancelSignature }
}

export function useMarkLoanDefaulted() {
  const { run, isPending, isSuccess, error, cancelSignature } = useWriteAction()
  const markLoanDefaulted = (loanId: number) =>
    run('Marking loan defaulted', (w) => w.markLoanDefaulted(loanId), [queryKeys.loan(loanId)])
  return { markLoanDefaulted, isPending, error, isSuccess, cancelSignature }
}

export function useRewards() {
  const { run, isPending, isSuccess, error, address, cancelSignature } = useWriteAction()
  const claimRewards = () =>
    run('Claiming rewards', (w) => w.claimRewards(), [queryKeys.userData(address!)])
  const claimYield = () =>
    run('Claiming yield', (w) => w.claimRewards(), [queryKeys.userData(address!)])
  return { claimRewards, claimYield, isPending, error, isSuccess, cancelSignature }
}

export function useStaking() {
  const { run, isPending, isSuccess, error, address, cancelSignature } = useWriteAction()
  const stake = (amount: bigint) =>
    run('Staking', (w) => w.stake(amount), [queryKeys.stake(address!), queryKeys.daoStats()])
  const unstake = (amount: bigint) =>
    run('Unstaking', (w) => w.unstake(amount), [queryKeys.stake(address!), queryKeys.daoStats()])
  return { stake, unstake, isPending, isSuccess, error, cancelSignature }
}

export function useTreasuryVoting() {
  const { run, isPending, isSuccess, error, address, cancelSignature } = useWriteAction()
  const voteOnTreasury = (proposalId: number, support: boolean) =>
    run('Casting vote', (w) => w.voteOnTreasuryProposal(proposalId, support), [
      queryKeys.treasuryProposalsAll(),
      queryKeys.hasVoted('Treasury', proposalId, address!),
      queryKeys.daoStats(),
    ])
  return { voteOnTreasury, isPending, isSuccess, error, cancelSignature }
}

export function useProposeTreasury() {
  const { run, isPending, isSuccess, error, cancelSignature } = useWriteAction()
  const propose = (
    amount: bigint,
    destination: string,
    reason: string,
    isPrivate: boolean
  ) =>
    run(
      'Proposing withdrawal',
      (w) => w.proposeTreasuryWithdrawal(amount, destination, reason, isPrivate),
      [queryKeys.backendStats()]
    )
  return { propose, isPending, isSuccess, error, cancelSignature }
}

export function useAttachDocument() {
  const { run, isPending, isSuccess, error, cancelSignature } = useWriteAction()
  const attach = (kind: 'Loan' | 'Treasury', proposalId: number, cid: string) =>
    run(
      'Attaching document',
      (w) => w.attachDocument(kind, proposalId, new TextEncoder().encode(cid.trim())),
      [queryKeys.proposalDocument(kind, proposalId)]
    )
  return { attach, isPending, isSuccess, error, cancelSignature }
}

export function useAdminActions() {
  const { run, isPending, isSuccess, error, cancelSignature } = useWriteAction()
  const pause = () => run('Pausing the DAO', (w) => w.pause(), [queryKeys.daoStats()])
  const unpause = () => run('Unpausing the DAO', (w) => w.unpause(), [queryKeys.daoStats()])
  const addAdmin = (admin: string) => run('Adding admin', (w) => w.addAdmin(admin), [queryKeys.admins()])
  const removeAdmin = (admin: string) =>
    run('Removing admin', (w) => w.removeAdmin(admin), [queryKeys.admins()])
  const setThreshold = (thresholdBps: number) =>
    run('Updating consensus threshold', (w) => w.setConsensusThreshold(thresholdBps), [
      queryKeys.daoStats(),
    ])
  return { pause, unpause, addAdmin, removeAdmin, setThreshold, isPending, isSuccess, error, cancelSignature }
}
