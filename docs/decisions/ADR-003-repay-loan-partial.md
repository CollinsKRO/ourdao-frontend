# ADR-003: `repay_loan_partial` is a separate entrypoint

**Date:** 2026-09-24
**Status:** Accepted
**Deciders:** Maintainers (mirrored from contract)

## Context

The Soroban contract exposes `repay_loan_partial` as a separate entrypoint
rather than modifying the signature of `repay_loan`. This is a deliberate
mirroring decision: the frontend's `dao-client.ts` must match the contract's
entrypoints 1:1 because Soroban contract calls are dispatched by function name.

## Decision

Mirror the contract's entrypoint structure exactly in `dao-client.ts`. Do not
merge `repay_loan` and `repay_loan_partial` into a single frontend function
with optional parameters — the contract doesn't do that, and diverging would
create a maintenance burden when the contract evolves.

## Consequences

- Two separate functions in `dao-client.ts` for related but distinct operations.
- When the contract adds or renames an entrypoint, `dao-client.ts` gets a
  corresponding change — no translation layer to maintain.
- Contributors working on loan repayment must understand that the split exists
  at the contract level, not just as a frontend convenience.

**Code reference:** `src/lib/dao-client.ts`
