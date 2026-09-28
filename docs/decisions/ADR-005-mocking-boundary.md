# ADR-005: Mock at the client boundary, not the hook boundary

**Date:** 2026-09-24
**Status:** Accepted
**Deciders:** Maintainers (established in closed issue #6)

## Context

When testing a page that reads data via hooks (e.g. `useLoan`, `useDAOStats`),
there are two places to mock:

1. **Hook boundary:** Mock `useLoan` itself to return canned data.
2. **Client boundary:** Mock `daoRead` in `dao-client.ts` to return canned data,
   letting the real `useLoan` hook process it.

Option 1 tests nothing — you're asserting that your mock returns what you put
in. Option 2 tests the full stack: the hook's query configuration, its mapping
logic, error handling, and the component's rendering of the result.

## Decision

All page render tests and behaviour tests mock at the client boundary
(`dao-client.ts` for contract reads, `backend.ts` for API reads). The one
exception is `useWallet()` from `wallet.tsx`, which is mocked at the hook
level because standing up a real Freighter provider in jsdom is impractical.

## Consequences

- Tests exercise real hook logic, catching regressions in query configuration,
  data mapping, and error states.
- Tests are slower than hook-level mocks (they run through more code), but
  the coverage is materially more valuable.
- New contributors should follow this convention — see
  `docs/testing-strategy.md` for details.

**Code reference:** `test/degradation-modes.test.tsx`, `test/dashboard-page.test.tsx`
