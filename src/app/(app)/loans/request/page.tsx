'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'
import {
  BanknotesIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  DocumentIcon
} from '@heroicons/react/24/outline'
import { useDAOStats, useUserData, useLoanRequest, useAttachDocument, useLoanTerms } from '@/hooks/useDAO'
import { parseToken, formatToken, computeMaxLoan, formatThreshold, formatDuration } from '@/lib/utils'
import dynamic from 'next/dynamic'

// Dynamic import to avoid SSR issues with IPFS
const DocumentUpload = dynamic(() => import('@/components/DocumentUpload'), { ssr: false })

// Type definition for DocumentMetadata
interface DocumentMetadata {
  name: string
  type: string
  size: number
  uploadedAt: Date
  encrypted: boolean
  hash: string
  tags?: string[]
  permissions?: {
    public: boolean
    allowedUsers?: string[]
    allowedRoles?: string[]
  }
}
import toast from 'react-hot-toast'
import { PageHeader } from '@/components/PageHeader'
import { useRequireMember } from '@/hooks/useRequireMember'
import { FormSkeleton } from '@/components/ui/skeleton'

export default function RequestLoanPage() {
  const router = useRouter()
  const stats = useDAOStats()
  const userData = useUserData()
  // The guard owns the redirect decision (#307). It waits for the wallet to
  // finish restoring *and* the membership read to settle before concluding
  // anything, so a hard refresh no longer bounces a connected member to `/`
  // while `isConnected` is still its temporary initial `false`.
  const { isResolving } = useRequireMember({ userData })
  const { requestLoan, isPending: isRequestPending } = useLoanRequest()
  const { attach, isPending: isAttachPending } = useAttachDocument()

  const [formData, setFormData] = useState({
    amount: '',
    documentHash: '',
  })

  const [step, setStep] = useState(1)
  const maxSteps = 3
  const [uploadedDocuments, setUploadedDocuments] = useState<DocumentMetadata[]>([])
  const [showDocumentUpload, setShowDocumentUpload] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const isPending = isRequestPending || isAttachPending

  // The contract caps a loan at treasury * policy ratio, so derive the cap from
  // live state; it is unknown until the stats have loaded.
  const maxLoan = stats.initialized
    ? computeMaxLoan(stats.treasuryBalance, stats.maxLoanToTreasuryRatio)
    : null
  const maxLoanDisplay = maxLoan === null ? null : formatToken(maxLoan, { displayDecimals: 7 })

  // Price the loan with the contract's own calculate_loan_terms: the rate is a
  // curve over amount / treasury, clamped by the policy's min/max rates, so it
  // cannot be reproduced client-side. Amounts over the cap aren't priced since
  // the contract would reject the request anyway.
  const parsedAmount = formData.amount ? parseToken(formData.amount) : BigInt(0)
  const exceedsMax = maxLoan !== null && parsedAmount > maxLoan
  const { terms, isLoading: termsLoading, isError: termsError } = useLoanTerms(
    parsedAmount > BigInt(0) && !exceedsMax ? parsedAmount : null
  )
  const rateDisplay = terms ? formatThreshold(terms.interestRate) : null

  const handleInputChange = (field: 'amount' | 'documentHash', value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!userData.isConnected || !userData.isMember) {
      toast.error('You must be a DAO member to request loans')
      return
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error('Please enter a valid loan amount')
      return
    }

    if (maxLoan !== null && parseToken(formData.amount) > maxLoan) {
      toast.error(`Amount exceeds the current maximum loan of ${maxLoanDisplay}`)
      return
    }

    if (userData.hasActiveLoan) {
      toast.error('You already have an active loan')
      return
    }

    try {
      const amount = parseToken(formData.amount)
      const proposalId = await requestLoan(amount)

      // Two separate on-chain transactions: the loan proposal itself always
      // succeeds by this point, so a failure attaching the document must not
      // be reported as if the whole request failed.
      if (formData.documentHash.trim()) {
        try {
          await attach('Loan', proposalId, formData.documentHash.trim())
        } catch {
          toast.error(
            'Your loan request was submitted, but attaching the document failed. You can retry from the loan page.'
          )
        }
      }

      setSubmitted(true)
      toast.success('Loan request submitted successfully!')
      setTimeout(() => router.push('/loans'), 2000)
    } catch {
      /* error handled by useWriteAction */
    }
  }

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <BanknotesIcon className="h-16 w-16 text-primary-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-foreground mb-2">Loan Details</h2>
              <p className="text-muted-foreground">
                Specify the amount of your loan request.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="amount" className="block text-sm font-medium text-foreground mb-1">
                  Loan Amount *
                </label>
                <input
                  type="number"
                  id="amount"
                  step="0.01"
                  min="0.01"
                  max={maxLoanDisplay ?? undefined}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  value={formData.amount}
                  onChange={(e) => handleInputChange('amount', e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {maxLoanDisplay === null
                    ? 'Maximum loan amount: loading…'
                    : `Maximum loan amount: ${maxLoanDisplay} (set by the treasury balance and loan policy)`}
                </p>
              </div>

              {parsedAmount > BigInt(0) && (
                <div
                  className="bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-900 rounded-lg p-4"
                  aria-live="polite"
                >
                  <h3 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">Loan Terms</h3>
                  {exceedsMax ? (
                    <p className="text-sm text-blue-800 dark:text-blue-400">
                      Enter an amount within the maximum to see the terms.
                    </p>
                  ) : termsError ? (
                    <p className="text-sm text-blue-800 dark:text-blue-400">
                      Couldn&apos;t load the loan terms from the contract. They will be set when the loan is approved.
                    </p>
                  ) : !terms ? (
                    <p className="text-sm text-blue-800 dark:text-blue-400">
                      {termsLoading ? 'Calculating terms…' : 'Loan terms unavailable.'}
                    </p>
                  ) : (
                    <>
                      <div className="space-y-2 text-sm text-blue-800 dark:text-blue-400">
                        <div className="flex justify-between">
                          <span>Loan Amount:</span>
                          <span>{formatToken(parsedAmount, { displayDecimals: 7 })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Interest Rate:</span>
                          <span>{rateDisplay} over the term</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Total Repayment:</span>
                          <span>{formatToken(terms.totalRepayment, { displayDecimals: 7 })}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Term:</span>
                          <span>{formatDuration(terms.duration)}</span>
                        </div>
                      </div>
                      <p className="text-xs text-blue-700 dark:text-blue-500 mt-2">
                        Priced by the contract from the current treasury balance and loan policy. Final terms are
                        fixed when the loan is approved and may differ if either changes.
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <DocumentIcon className="h-16 w-16 text-primary-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-foreground mb-2">Supporting Documents</h2>
              <p className="text-muted-foreground">
                Upload optional supporting documents to strengthen your loan proposal.
              </p>
            </div>

            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300" role="note">
              Loan amounts and proposal details are public on the Stellar ledger. Supporting documents are stored on public IPFS and anyone with the content link can read them. Do not upload sensitive information.
            </p>

            {stats.features.documentStorage ? (
              <div className="space-y-6">
                {/* Document Upload Toggle */}
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="showDocumentUpload"
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-input rounded"
                    checked={showDocumentUpload}
                    onChange={(e) => setShowDocumentUpload(e.target.checked)}
                  />
                  <label htmlFor="showDocumentUpload" className="text-sm font-medium text-foreground">
                    Add supporting documents
                  </label>
                </div>

                {/* Document Upload Component */}
                {showDocumentUpload && (
                  <DocumentUpload
                    multiple
                    accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png"
                    maxSize={5}
                    allowEncryption={false}
                    showPermissions={false}
                    onUpload={(documents) => {
                      setUploadedDocuments(documents)
                      // Update document hash with first document's hash
                      if (documents.length > 0) {
                        handleInputChange('documentHash', documents[0].hash)
                      }
                    }}
                    onError={(error) => toast.error(error)}
                    className="border border-border rounded-lg p-4"
                  />
                )}

                {/* Uploaded Documents List */}
                {uploadedDocuments.length > 0 && (
                  <div className="border border-border rounded-lg p-4">
                    <h4 className="font-medium text-foreground mb-3">
                      Uploaded Documents ({uploadedDocuments.length})
                    </h4>
                    <div className="space-y-2">
                      {uploadedDocuments.map((doc, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                          <div className="flex items-center space-x-2">
                            <DocumentIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-foreground">{doc.name}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {(doc.size / 1024).toFixed(1)} KB
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Manual IPFS Hash Input */}
                <div>
                  <label htmlFor="documentHash" className="block text-sm font-medium text-foreground mb-1">
                    Or enter IPFS hash manually
                  </label>
                  <input
                    type="text"
                    id="documentHash"
                    placeholder="QmXxXxXx... (IPFS hash of supporting documents)"
                    className="w-full px-3 py-2 border border-input rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    value={formData.documentHash}
                    onChange={(e) => handleInputChange('documentHash', e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    If you&apos;ve already uploaded documents to IPFS, enter the hash here
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 bg-muted rounded-lg">
                <DocumentIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-2">Document storage is currently disabled</p>
                <p className="text-sm text-muted-foreground">
                  DAO governance has disabled document storage features. You can proceed without documents.
                </p>
              </div>
            )}
          </div>
        )

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <CheckCircleIcon className="h-16 w-16 text-primary-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-foreground mb-2">Review & Submit</h2>
              <p className="text-muted-foreground">
                Review your loan request details before submission.
              </p>
            </div>

            <div className="border border-border rounded-lg p-6 space-y-4">
              <h3 className="font-semibold text-foreground">Loan Request Summary</h3>

              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Requested Amount:</span>
                  <span className="font-medium">{formatToken(parseToken(formData.amount), { displayDecimals: 7 })}</span>
                </div>

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Interest Rate:</span>
                  <span className="font-medium">{rateDisplay ? `${rateDisplay} over the term` : 'Unavailable'}</span>
                </div>

                {terms && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Repayment:</span>
                    <span className="font-medium">{formatToken(terms.totalRepayment, { displayDecimals: 7 })}</span>
                  </div>
                )}

                <div className="flex justify-between">
                  <span className="text-muted-foreground">Supporting Docs:</span>
                  <span className="font-medium">
                    {uploadedDocuments.length > 0 ? `${uploadedDocuments.length} files` :
                     formData.documentHash ? 'IPFS hash provided' : 'None'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 dark:bg-blue-950/30 dark:border-blue-900 rounded-lg p-4">
              <h4 className="font-semibold text-blue-900 dark:text-blue-300 mb-2">What happens next?</h4>
              <ol className="text-sm text-blue-800 dark:text-blue-400 space-y-1 list-decimal list-inside">
                <li>Your loan proposal will be created and enter a 3-day editing phase</li>
                <li>After editing, members will have 7 days to vote on your proposal</li>
                <li>If approved by majority consensus, the loan will be automatically disbursed</li>
                <li>
                  You&apos;ll have {terms ? formatDuration(terms.duration) : 'the policy\'s loan term'} to repay the
                  loan with interest
                </li>
              </ol>
            </div>

            {userData.hasActiveLoan && (
              <div className="bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-900 rounded-lg p-4">
                <div className="flex items-start">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 mr-2" />
                  <div className="text-sm text-red-800 dark:text-red-300">
                    <p className="font-medium">Active Loan Detected</p>
                    <p>You already have an active loan. Please repay your current loan before requesting a new one.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )

      default:
        return null
    }
  }

  const renderStepIndicator = () => {
    return (
      <div className="flex items-center justify-center space-x-4 mb-8">
        {Array.from({ length: maxSteps }, (_, i) => {
          const stepNumber = i + 1
          const isCompleted = stepNumber < step
          const isCurrent = stepNumber === step

          return (
            <div key={stepNumber} className="flex items-center">
              <div
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium
                  ${
                    isCompleted
                      ? 'bg-green-500 text-white'
                      : isCurrent
                      ? 'bg-primary-600 text-white'
                      : 'bg-muted text-muted-foreground'
                  }
                `}
              >
                {isCompleted ? <CheckCircleIcon className="h-6 w-6" /> : stepNumber}
              </div>
              {stepNumber < maxSteps && (
                <div
                  className={`w-8 h-0.5 ${
                    stepNumber < step ? 'bg-green-500' : 'bg-muted'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // While the wallet restores / membership resolves we don't yet know whether
  // this visitor may stay, so show the form's shape rather than the
  // "Access Restricted" card. The old version rendered the restriction card
  // immediately on every hard refresh, then swapped it for the form once the
  // address arrived — a flash of "you can't do this" at a member who can (#307).
  if (isResolving) {
    return (
      <>
        <PageHeader title="Request a Loan" subtitle="Tell the DAO what you need" />
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="p-8">
              <FormSkeleton fields={2} showSubmit={false} />
            </CardContent>
          </Card>
        </div>
      </>
    )
  }

  if (!userData.isConnected || !userData.isMember) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>Access Restricted</CardTitle>
            <CardDescription>
              You must be a DAO member to request loans
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button asChild className="w-full" size="lg">
              <Link href={userData.isConnected ? "/register" : "/"}>
                {userData.isConnected ? "Become a Member" : "Go Home"}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <>
      <PageHeader title="Request a Loan" subtitle="Tell the DAO what you need" />
      <div className="max-w-2xl mx-auto">

        <Card>
          <CardContent className="p-8">
            {renderStepIndicator()}

            <form onSubmit={handleSubmit}>
              {renderStepContent()}

              <div className="flex justify-between mt-8">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep(Math.max(1, step - 1))}
                  disabled={step === 1}
                >
                  Previous
                </Button>

                {step < maxSteps ? (
                  <Button
                    type="button"
                    onClick={() => setStep(Math.min(maxSteps, step + 1))}
                    disabled={step === 1 && !formData.amount}
                  >
                    Next
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    loading={isPending}
                    disabled={userData.hasActiveLoan || !formData.amount}
                    className="min-w-[120px]"
                  >
                    {isPending ? 'Submitting...' : 'Submit Request'}
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        {submitted && (
          <Card className="mt-6 border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
            <CardContent className="p-4">
              <div className="flex items-center">
                <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400 mr-2" />
                <span className="text-green-800 dark:text-green-300 font-medium">
                  Loan request submitted successfully! Redirecting to loans page...
                </span>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
