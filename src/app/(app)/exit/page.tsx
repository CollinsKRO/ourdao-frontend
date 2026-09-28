'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ConnectButton } from '@/components/ConnectButton'
import Link from 'next/link'
import {
  ArrowRightOnRectangleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline'
import { useUserData, useExitDao, useStake } from '@/hooks/useDAO'
import { useRequireMember } from '@/hooks/useRequireMember'
import { LoadError } from '@/components/LoadError'
import { useAnnounceLoad } from '@/lib/useAnnounceLoad'
import { formatToken } from '@/lib/utils'
import { formatStellarAddress } from '@/lib/stellar'
import { MEMBER_STATUS_LABELS } from '@/constants'
import { LoadingSpinner } from '@/components/ui/skeleton'

export default function ExitPage() {
  const userData = useUserData()
  const myStake = useStake()
  const { exitDao, isPending, isSuccess } = useExitDao()
  const { isResolving } = useRequireMember({ userData })
  useAnnounceLoad('Exit DAO', userData.isLoading, !!userData.isError)

  const [confirmed, setConfirmed] = useState(false)

  if (isResolving) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!userData.isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Exit DAO</CardTitle>
            <CardDescription>
              Connect your wallet to exit the DAO
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ConnectButton.Custom>
              {({ openConnectModal }) => (
                <Button onClick={openConnectModal} className="w-full" size="lg">
                  Connect Wallet
                </Button>
              )}
            </ConnectButton.Custom>
            <div className="text-center">
              <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
                &larr; Back to Home
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (userData.isError) {
    return (
      <div className="mx-auto mt-8 max-w-md">
        <LoadError
          what="your membership data"
          onRetry={userData.refetch}
        />
      </div>
    )
  }

  if (!userData.isMember) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Not a Member</CardTitle>
            <CardDescription>
              You must be a DAO member to exit
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full" size="lg">
              <Link href="/register">
                Join the DAO
              </Link>
            </Button>
            <div className="text-center">
              <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
                &larr; Back to Home
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const shareBalance = userData.member?.shareBalance ?? BigInt(0)
  const pendingYield = userData.pendingYield ?? BigInt(0)
  const totalExitAmount = shareBalance + pendingYield + myStake
  const hasActiveLoan = userData.hasActiveLoan

  const handleExit = async () => {
    try {
      await exitDao()
      setConfirmed(false)
    } catch {
      /* toast handled in hook */
    }
  }

  return (
    <>
      <PageHeader
        title="Exit DAO"
        subtitle="Withdraw your share, stake, and pending yield in one transaction"
      />

      <div className="mx-auto max-w-2xl space-y-6">
        {/* Success state */}
        {isSuccess && (
          <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
            <CardContent className="flex items-start gap-3 p-6">
              <CheckCircleIcon className="h-6 w-6 shrink-0 text-green-600 dark:text-green-400" />
              <div>
                <h3 className="font-semibold text-green-900 dark:text-green-200">
                  Successfully exited the DAO
                </h3>
                <p className="mt-1 text-sm text-green-700 dark:text-green-300">
                  Your share, stake, and pending yield have been withdrawn to your wallet.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link href="/">Return Home</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active loan warning */}
        {hasActiveLoan && (
          <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
            <CardContent className="flex items-start gap-3 p-6">
              <ExclamationTriangleIcon className="h-6 w-6 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <h3 className="font-semibold text-amber-900 dark:text-amber-200">
                  Active loan detected
                </h3>
                <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                  You have an active loan. The contract requires you to repay your loan before
                  exiting the DAO. Please{' '}
                  <Link
                    href="/loans"
                    className="font-medium text-amber-800 underline dark:text-amber-200"
                  >
                    repay your loan
                  </Link>{' '}
                  first.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Exit summary */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRightOnRectangleIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
              Exit Summary
            </CardTitle>
            <CardDescription>
              Review what you will receive upon exiting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Member</p>
                  <p className="font-medium text-foreground">
                    {formatStellarAddress(userData.address || '')}
                  </p>
                </div>
                <Badge variant={userData.member?.status === 1 ? 'default' : 'secondary'}>
                  {userData.member
                    ? MEMBER_STATUS_LABELS[userData.member.status]
                    : 'Unknown'}
                </Badge>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg bg-muted p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Share Balance</p>
                  <p className="text-xs text-muted-foreground">
                    Your proportional share of the treasury
                  </p>
                </div>
                <p className="text-lg font-semibold text-foreground">
                  {formatToken(shareBalance)}
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-muted p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Stake</p>
                  <p className="text-xs text-muted-foreground">
                    Your staked tokens
                  </p>
                </div>
                <p className="text-lg font-semibold text-foreground">
                  {formatToken(myStake)}
                </p>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-muted p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">Pending Yield</p>
                  <p className="text-xs text-muted-foreground">
                    Unclaimed yield from restaking
                  </p>
                </div>
                <p className="text-lg font-semibold text-foreground">
                  {formatToken(pendingYield)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Total Exit Amount</p>
                <p className="text-xs text-muted-foreground">
                  Withdrawn to your wallet
                </p>
              </div>
              <p className="text-2xl font-bold text-primary">
                {formatToken(totalExitAmount)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Irreversible warning */}
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="flex items-start gap-3 p-6">
            <ExclamationTriangleIcon className="h-6 w-6 shrink-0 text-red-600 dark:text-red-400" />
            <div>
              <h3 className="font-semibold text-red-900 dark:text-red-200">
                This action is irreversible
              </h3>
              <p className="mt-1 text-sm text-red-700 dark:text-red-300">
                Once you exit the DAO, you will lose your membership, voting weight, and
                participation in governance. You will need to register again as a new member
                to rejoin.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Confirmation */}
        {!isSuccess && (
          <Card>
            <CardHeader>
              <CardTitle>Confirm Exit</CardTitle>
              <CardDescription>
                Please confirm that you understand the consequences
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-start gap-3 rounded-lg border border-border p-4 cursor-pointer hover:bg-accent/50 transition-colors">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-input"
                />
                <span className="text-sm text-foreground">
                  I understand that exiting the DAO is irreversible and I will lose my
                  membership, voting weight, and governance participation.
                </span>
              </label>

              <Button
                onClick={handleExit}
                disabled={!confirmed || isPending || hasActiveLoan}
                variant="destructive"
                size="lg"
                className="w-full"
              >
                {isPending ? (
                  'Exiting...'
                ) : (
                  <>
                    <ArrowRightOnRectangleIcon className="mr-2 h-5 w-5" />
                    Exit DAO
                  </>
                )}
              </Button>

              {hasActiveLoan && (
                <p className="text-center text-xs text-amber-600 dark:text-amber-400">
                  You must repay your active loan before exiting.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Info footer */}
        <div className="flex items-start gap-2 rounded-lg bg-blue-50 p-4 dark:bg-blue-950/30">
          <InformationCircleIcon className="h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Exiting the DAO withdraws your share balance, staked tokens, and all pending
            yield in a single transaction. The funds will be sent directly to your connected
            wallet.
          </p>
        </div>
      </div>
    </>
  )
}
