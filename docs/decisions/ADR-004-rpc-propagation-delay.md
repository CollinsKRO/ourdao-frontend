# ADR-004: `RPC_PROPAGATION_DELAY_MS` exists and is untested

**Date:** 2026-09-24
**Status:** Accepted
**Deciders:** Maintainers

## Context

After submitting a transaction to the Soroban RPC, the ledger state may not
reflect the submission immediately. The RPC's `getTransaction` may return
`NOT_FOUND` or `PENDING` even though the transaction has been accepted. This
is an inherent property of distributed ledger systems — there is a propagation
delay between submission and confirmation.

The `RPC_PROPAGATION_DELAY_MS` constant in `src/hooks/dao/writes.ts` accounts
for this by adding a delay before re-querying the contract state after a
successful submission.

## Decision

Keep `RPC_PROPAGATION_DELAY_MS` as a named constant with a documented
rationale rather than embedding a magic number. Do not add a unit test for the
delay value itself — testing that a constant equals a specific number of
milliseconds is not meaningful. The integration behaviour (retry after delay)
is covered by the write-action tests.

## Consequences

- The delay is visible and editable in one place.
- Future contributors understand why the delay exists without reading git
  history.
- The value may need tuning as network conditions change — it is not a
  permanent contract.

**Code reference:** `src/hooks/dao/writes.ts:13–20`
