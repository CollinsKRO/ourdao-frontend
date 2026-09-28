import { isStellarAddress } from './stellar'
import { parseToken } from './utils'

export interface FieldError {
  field: string
  message: string
}

export function required(value: string, field: string, label: string): FieldError | null {
  return value.trim() ? null : { field, message: `${label} is required` }
}

export function positiveTokenAmount(value: string, field: string, label: string): FieldError | null {
  try {
    return parseToken(value) > BigInt(0)
      ? null
      : { field, message: `${label} must be greater than zero` }
  } catch {
    return { field, message: `${label} must be a valid amount` }
  }
}

export function stellarAddress(value: string, field: string, label: string): FieldError | null {
  return isStellarAddress(value.trim())
    ? null
    : { field, message: `${label} must be a valid Stellar address` }
}

export function compactErrors(errors: Array<FieldError | null>): FieldError[] {
  return errors.filter((error): error is FieldError => Boolean(error))
}
