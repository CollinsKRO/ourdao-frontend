'use client'

/**
 * Challenge-response authentication for `ourdao-backend`'s authenticated
 * endpoints.
 *
 * The backend does not trust an address asserted by the client. A caller proves
 * control of a `G…`/`M…` key in three steps (ourdao-backend `src/auth.ts`):
 *
 *   1. `GET /api/auth/challenge?address=<address>` → `{ nonce }`. The nonce is
 *      32 random bytes as hex, scoped to the address, valid for 5 minutes.
 *   2. Sign the exact UTF-8 string `"<nonce>:<address>"` with the wallet's
 *      ed25519 key (Freighter's `signMessage`). The backend reconstructs that
 *      same string and verifies it against the address's public key.
 *   3. Send `Authorization: StellarSignature <address>:<signature>:<nonce>`.
 *      The backend splits on `:` and requires exactly three parts, then
 *      consumes the nonce.
 *
 * Two properties of that protocol drive the design here:
 *
 * - **A nonce is single-use.** `consume()` deletes it on the first successful
 *   verification, and `issue()` hands back the *same* nonce for an address that
 *   still has an unexpired one. So two concurrent mutations for one address
 *   would both sign the same nonce and the second would be rejected with
 *   `Invalid or expired nonce`. {@link serializePerAddress} exists to make
 *   that impossible: one in-flight signed mutation per address at a time.
 * - **A contract (`C…`) account cannot authenticate at all.** It has no
 *   ed25519 key — it authorizes through `__check_auth`, which needs an on-chain
 *   RPC call the auth path deliberately does not make. The backend answers
 *   `400` for `C…`. We detect that locally so the member gets a real
 *   explanation instead of a signature prompt that can never succeed, and
 *   instead of a misleading "invalid signature".
 */

import { BACKEND_URL, isBackendConfigured } from './backend-config'

/** The `Authorization` scheme the backend's `extractAuthHeaders` requires. */
export const AUTH_SCHEME = 'StellarSignature'

/** A proven (or attempted) signing of the backend's challenge payload. */
export interface SignedAuth {
  address: string
  signature: string
  nonce: string
}

/** A wallet able to sign the backend's challenge payload. */
export interface AuthSigner {
  address: string
  signMessage: (message: string) => Promise<string>
}

/** Why a handshake could not produce a usable header. */
export type AuthFailureReason =
  | 'unsupported-address'
  | 'challenge-unavailable'
  | 'challenge-rejected'
  | 'rejected'

/** A handshake that never produced a header, with a member-facing reason. */
export class AuthError extends Error {
  readonly reason: AuthFailureReason
  readonly status: number | null

  constructor(reason: AuthFailureReason, message: string, status: number | null = null) {
    super(message)
    this.name = 'AuthError'
    this.reason = reason
    this.status = status
  }
}

/**
 * The exact bytes the backend verifies: `Buffer.from(`${nonce}:${address}`,
 * 'utf8')` in `verifySignature`. Exported so the format is asserted directly by
 * tests rather than only through the request that carries it.
 */
export function buildAuthPayload(nonce: string, address: string): string {
  return `${nonce}:${address}`
}

/**
 * `Authorization: StellarSignature <address>:<signature>:<nonce>`.
 *
 * The backend splits the value on `:` and requires exactly three parts, so
 * none of the three may contain a colon. A strkey address never does, the
 * backend's nonce is hex, and base64 uses the `+/=±` alphabet — none of which
 * include `:`.
 */
export function buildAuthHeader({ address, signature, nonce }: SignedAuth): string {
  return `${AUTH_SCHEME} ${address}:${signature}:${nonce}`
}

/**
 * Whether this address can produce an ed25519 signature the backend will
 * accept. `C…` (contract) accounts cannot — see the module comment.
 */
export function canSignForBackend(address: string): boolean {
  return address.startsWith('G') || address.startsWith('M')
}

/** Fetch a fresh challenge nonce for `address`. */
export async function fetchAuthChallenge(address: string): Promise<string> {
  if (!isBackendConfigured()) {
    throw new AuthError(
      'challenge-unavailable',
      'No backend is configured, so there is nothing to authenticate against.'
    )
  }
  if (!canSignForBackend(address)) {
    throw new AuthError(
      'unsupported-address',
      'Contract (C…) accounts cannot sign the backend’s authentication challenge. Use a G… or M… account to change notification settings.'
    )
  }

  const url = `${BACKEND_URL}/api/auth/challenge?address=${encodeURIComponent(address)}`
  let res: Response
  try {
    res = await fetch(url, {
      headers: { accept: 'application/json' },
      cache: 'no-store',
    })
  } catch (cause) {
    throw new AuthError(
      'challenge-unavailable',
      `Could not reach the backend to start authentication: ${
        cause instanceof Error ? cause.message : String(cause)
      }`
    )
  }

  if (!res.ok) {
    // The backend answers 400 for an address it cannot authenticate (C…, or
    // malformed) and 503 when its nonce store is full. Distinguish them so the
    // member is not told to retry a request that can never succeed.
    const reason: AuthFailureReason =
      res.status === 400 ? 'unsupported-address' : 'challenge-unavailable'
    throw new AuthError(
      reason,
      res.status === 400
        ? 'The backend rejected this address as an authentication identity. Contract (C…) accounts are not supported.'
        : `The backend could not issue an authentication challenge (${res.status}).`,
      res.status
    )
  }

  // The response is untrusted input: a shape drift must fail loudly rather than
  // sign `"undefined:<address>"` and send a header that can never verify.
  const body = (await res.json().catch(() => null)) as { nonce?: unknown } | null
  if (typeof body?.nonce !== 'string' || !body.nonce) {
    throw new AuthError(
      'challenge-rejected',
      'The backend returned an authentication challenge in an unexpected format.'
    )
  }
  return body.nonce
}

/**
 * Run the full handshake and return a ready-to-send {@link SignedAuth}.
 *
 * A rejected signature prompt is surfaced as an `AuthError` with reason
 * `rejected` rather than being swallowed: the caller must be able to tell
 * "the member said no" apart from "the network is down", because only the
 * first is something they can act on by trying again.
 */
export async function requestSignedAuth({ address, signMessage }: AuthSigner): Promise<SignedAuth> {
  const nonce = await fetchAuthChallenge(address)

  let signature: string
  try {
    signature = await signMessage(buildAuthPayload(nonce, address))
  } catch (cause) {
    throw new AuthError(
      'rejected',
      cause instanceof Error && cause.message
        ? `Signature rejected: ${cause.message}`
        : 'Signature request was rejected.',
      null
    )
  }
  if (!signature) {
    throw new AuthError('rejected', 'Signature request was rejected.')
  }

  return { address, signature, nonce }
}

/**
 * Serialize signed mutations per address.
 *
 * Nonces are single-use but `issue()` is idempotent per address, so two
 * overlapping mutations would reuse one nonce and the loser would get a
 * `401 Invalid or expired nonce`. Chaining on the address keeps every member to
 * at most one signed request in flight while leaving different addresses (and
 * the rest of the app) fully parallel.
 */
const chains = new Map<string, Promise<unknown>>()

export function serializePerAddress<T>(address: string, task: () => Promise<T>): Promise<T> {
  const previous = chains.get(address) ?? Promise.resolve()
  const next = previous.then(task, task)
  // Keep the chain alive but never let a rejection leak as unhandled.
  chains.set(
    address,
    next.catch(() => undefined)
  )
  return next
}
