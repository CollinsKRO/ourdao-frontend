/**
 * Human-readable messages for every error code published by ourdao-contracts.
 * Kept in sync with contracts/dao/src/error.rs — codes are append-only.
 *
 * @see https://github.com/ourdao/ourdao-contracts#error-codes
 */
import { logger } from '@/lib/logger'
export const CONTRACT_ERROR_MESSAGES: Record<number, string> = {
  // lifecycle / config
  1: 'This DAO has already been initialized.',
  2: 'The DAO has not been initialized yet.',
  3: 'Invalid consensus threshold value.',
  4: 'The amount is invalid.',
  5: 'The loan policy parameters are invalid.',
  6: 'The DAO is currently paused. All state-changing operations are blocked.',
  7: 'The DAO is not paused.',

  // authorization
  10: 'You are not authorized to perform this action.',
  11: 'You must be an admin to perform this action.',
  12: 'You must be a DAO member to perform this action.',
  13: 'This address is already an admin.',
  14: 'You are already a member of this DAO.',
  15: 'Cannot remove the last admin — the DAO would have no recovery path.',

  // membership
  20: 'Your membership is not active.',
  21: 'You already have an active loan and cannot take another.',

  // loans
  30: 'Loan proposal not found.',
  31: 'Only the borrower can perform this action.',
  32: 'This proposal is not in the editing phase.',
  33: 'This proposal is not in the voting phase.',
  34: 'Voting has ended for this proposal.',
  35: 'You have already voted on this proposal.',
  36: 'You are not eligible for a loan at this time.',
  37: 'You are on cooldown — you borrowed recently and must wait before requesting another loan.',
  38: 'Loan not found.',
  39: 'This loan is not active.',
  40: 'The requested amount exceeds the maximum loan-to-treasury ratio.',
  41: 'Insufficient treasury balance to fund this loan.',
  42: 'This loan is not overdue and cannot be marked as defaulted.',

  // treasury
  50: 'Treasury proposal not found.',

  // name / staking
  60: 'That name is already taken.',
  61: 'No member found with that name.',
  62: 'You have no staked tokens.',
  63: 'Insufficient staked tokens for this operation.',
  64: 'No commitment found — you must commit before revealing.',
  65: 'Commitment mismatch — the reveal does not match the committed hash.',
  66: 'You have already revealed your vote for this proposal.',
  67: 'Nothing to claim.',

  // appended
  70: 'This proposal has not expired yet.',
  71: 'The name is invalid.',
  72: 'You must reveal your vote before it can be counted.',
  73: 'Only the proposal owner can modify its attached document.',
}

const DEFAULT_ERROR_MESSAGE = 'An unexpected contract error occurred.'

/**
 * Human-readable message for a contract error code.
 * Falls back to a generic message for unrecognised codes.
 */
export function contractErrorMessage(code: number): string {
  return CONTRACT_ERROR_MESSAGES[code] ?? DEFAULT_ERROR_MESSAGE
}

/**
 * Extract the numeric contract error code from a Soroban host error string.
 *
 * Handles both simulation errors (e.g. `HostError: Error(Contract, [#35])`)
 * and submission errors (which may be JSON-stringified).
 *
 * Returns the numeric code if found, or `null` if the string doesn't match.
 */
export function parseContractErrorCode(error: unknown): number | null {
  if (typeof error !== 'string') return null
  // Match patterns like [#35] or [#35, ...]
  const match = error.match(/\[#(\d+)/)
  return match ? Number(match[1]) : null
}

/**
 * Given a raw error (from simulation or submission), return a user-friendly
 * message. If the error contains a recognised contract code, the matching
 * message is returned; otherwise the original error string is returned as-is.
 * The raw error is always logged to the console for debugging.
 */
export function formatContractError(error: unknown): string {
  logger.error('[contract-error]', { error })
  const code = parseContractErrorCode(error)
  if (code !== null) {
    return contractErrorMessage(code)
  }
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
