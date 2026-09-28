'use client'

import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useCallback, useRef, useState } from 'react'
import React from 'react'
import toast from 'react-hot-toast'
import { useWallet } from '@/lib/wallet'
import { MESSAGES } from '@/lib/messages'
import { getTransactionUrl } from '@/lib/stellar'
import { daoWrite, InvokeError, type InvokeResult } from '@/lib/dao-client'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const RPC_PROPAGATION_DELAY_MS = 500

/**
 * Shared plumbing for a write action: resolves the wallet + signer, tracks
 * pending/success/error, surfaces toasts, and invalidates the query keys the
 * action affects once the write is confirmed.
 */
export function useWriteAction() {
  const { address, signXDR, isConnected } = useWallet()
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
    setError(new Error(MESSAGES.wallet.signatureCancelled))
    setRetryable(true)
    toast.error(MESSAGES.wallet.signatureCancelled)
  }, [])

  const run = useCallback(
    async (
      label: string,
      fn: (w: ReturnType<typeof daoWrite>) => Promise<InvokeResult>,
      invalidates: QueryKey[] = []
    ) => {
      if (!isConnected || !address) {
        toast.error(MESSAGES.wallet.connectFirst)
        throw new Error(MESSAGES.wallet.notConnected)
      }
      setPending(true)
      setSuccess(false)
      setError(null)
      setRetryable(false)

      const toastId = toast.loading(MESSAGES.writes.pending(label))
      toastIdRef.current = toastId

      const controller = new AbortController()
      abortControllerRef.current = controller

      const wrappedSignXDR = (xdr: string) =>
        signXDR(xdr, { signal: controller.signal })

      try {
        const res = await fn(daoWrite(address, wrappedSignXDR))
        setSuccess(true)
        toast.success(
          React.createElement(
            'span',
            null,
            MESSAGES.writes.confirmed(label),
            React.createElement(
              'a',
              {
                href: getTransactionUrl(res.hash),
                target: '_blank',
                rel: 'noopener noreferrer',
                className: 'underline',
              },
              MESSAGES.writes.viewTransaction
            )
          ),
          { id: toastId }
        )
        if (RPC_PROPAGATION_DELAY_MS > 0) {
          await sleep(RPC_PROPAGATION_DELAY_MS)
        }
        for (const queryKey of invalidates) {
          queryClient.invalidateQueries({ queryKey })
        }
        return res
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        const isTimeout = e.message.includes('timed out')
        const isCancel = e.message.includes('cancelled')
        const isInvokeRetryable = e instanceof InvokeError && e.retryable

        const retryable = isTimeout || isCancel || isInvokeRetryable
        setError(e)
        setRetryable(retryable)

        if (isTimeout) {
          toast.error(MESSAGES.writes.timedOut(label), { id: toastId })
        } else if (isCancel) {
          toast.error(MESSAGES.writes.cancelled(label), { id: toastId })
        } else if (retryable) {
          toast.error(MESSAGES.writes.failedRetryable(label, e.message), { id: toastId })
        } else {
          toast.error(MESSAGES.writes.failed(label, e.message), { id: toastId })
        }

        throw e
      } finally {
        setPending(false)
        abortControllerRef.current = null
        toastIdRef.current = null
      }
    },
    [address, isConnected, signXDR, queryClient]
  )

  return { run, isPending, isSuccess, error, isRetryable, address, cancelSignature }
}

export function useMemberRegistration() {
  const { run, isPending, isSuccess, error, address, cancelSignature } = useWriteAction()
  const registerMember = () =>
    run(MESSAGES.writes.labels.register, (w) => w.registerMember(), [
      ['userData', address],
      ['daoStats'],
    ])
  return { registerMember, isPending, error, isSuccess, cancelSignature }
}

export function useLoanRequest() {
  const { run, isPending, isSuccess, error, cancelSignature } = useWriteAction()
  const requestLoan = (amount: bigint) =>
    run(MESSAGES.writes.labels.requestLoan, (w) => w.requestLoan(amount), [['backendStats']]).then(
      (res) => Number(res.returnValue)
    )
  return { requestLoan, isPending, error, isSuccess, cancelSignature }
}

export function useVoting() {
  const { run, isPending, isSuccess, error, address, cancelSignature } = useWriteAction()
  const voteOnProposal = (proposalId: number, support: boolean) =>
    run(MESSAGES.writes.labels.vote, (w) => w.voteOnLoanProposal(proposalId, support), [
      ['loanProposal', proposalId],
      ['loanProposals'],
      ['hasVoted', 'Loan', proposalId, address],
      ['daoStats'],
    ])
  return { voteOnProposal, isPending, error, isSuccess, cancelSignature }
}

export function useLoanRepayment() {
  const { run, isPending, isSuccess, error, address, cancelSignature } = useWriteAction()
  const repayLoan = (loanId: number, amount?: bigint) => {
    if (amount !== undefined) {
      if (amount <= BigInt(0)) throw new Error(MESSAGES.validation.repaymentMustBePositive)
      return run(MESSAGES.writes.labels.repay, (w) => w.repayLoanPartial(loanId, amount), [
        ['loan', loanId],
        ['userData', address],
        ['daoStats'],
      ])
    }
    return run(MESSAGES.writes.labels.repay, (w) => w.repayLoan(loanId), [
      ['loan', loanId],
      ['userData', address],
      ['daoStats'],
    ])
  }
  const repayLoanPartial = (loanId: number, amount: bigint) => {
    if (amount <= BigInt(0)) throw new Error(MESSAGES.validation.repaymentMustBePositive)
    return run(MESSAGES.writes.labels.repay, (w) => w.repayLoanPartial(loanId, amount), [
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
    run(MESSAGES.writes.labels.markDefaulted, (w) => w.markLoanDefaulted(loanId), [['loan', loanId]])
  return { markLoanDefaulted, isPending, error, isSuccess, cancelSignature }
}

export function useRewards() {
  const { run, isPending, isSuccess, error, address, cancelSignature } = useWriteAction()
  const claimRewards = () =>
    run(MESSAGES.writes.labels.claimRewards, (w) => w.claimRewards(), [['userData', address]])
  const claimYield = () =>
    run(MESSAGES.writes.labels.claimYield, (w) => w.claimRewards(), [['userData', address]])
  return { claimRewards, claimYield, isPending, error, isSuccess, cancelSignature }
}

export function useStaking() {
  const { run, isPending, isSuccess, error, address, cancelSignature } = useWriteAction()
  const stake = (amount: bigint) =>
    run(MESSAGES.writes.labels.stake, (w) => w.stake(amount), [['stake', address], ['daoStats']])
  const unstake = (amount: bigint) =>
    run(MESSAGES.writes.labels.unstake, (w) => w.unstake(amount), [['stake', address], ['daoStats']])
  return { stake, unstake, isPending, isSuccess, error, cancelSignature }
}

export function useTreasuryVoting() {
  const { run, isPending, isSuccess, error, address, cancelSignature } = useWriteAction()
  const voteOnTreasury = (proposalId: number, support: boolean) =>
    run(MESSAGES.writes.labels.vote, (w) => w.voteOnTreasuryProposal(proposalId, support), [
      ['treasuryProposals'],
      ['hasVoted', 'Treasury', proposalId, address],
      ['daoStats'],
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
      MESSAGES.writes.labels.proposeWithdrawal,
      (w) => w.proposeTreasuryWithdrawal(amount, destination, reason, isPrivate),
      [['backendStats']]
    )
  return { propose, isPending, isSuccess, error, cancelSignature }
}

export function useAttachDocument() {
  const { run, isPending, isSuccess, error, cancelSignature } = useWriteAction()
  const attach = (kind: 'Loan' | 'Treasury', proposalId: number, cid: string) =>
    run(
      MESSAGES.writes.labels.attachDocument,
      (w) => w.attachDocument(kind, proposalId, new TextEncoder().encode(cid.trim())),
      [['document', kind, proposalId]]
    )
  return { attach, isPending, isSuccess, error, cancelSignature }
}

export function useAdminActions() {
  const { run, isPending, isSuccess, error, cancelSignature } = useWriteAction()
  const pause = () => run(MESSAGES.writes.labels.pause, (w) => w.pause(), [['daoStats']])
  const unpause = () => run(MESSAGES.writes.labels.unpause, (w) => w.unpause(), [['daoStats']])
  const addAdmin = (admin: string) => run(MESSAGES.writes.labels.addAdmin, (w) => w.addAdmin(admin), [['admins']])
  const removeAdmin = (admin: string) =>
    run(MESSAGES.writes.labels.removeAdmin, (w) => w.removeAdmin(admin), [['admins']])
  const setThreshold = (thresholdBps: number) =>
    run(MESSAGES.writes.labels.setThreshold, (w) => w.setConsensusThreshold(thresholdBps), [
      ['daoStats'],
    ])
  return { pause, unpause, addAdmin, removeAdmin, setThreshold, isPending, isSuccess, error, cancelSignature }
}
