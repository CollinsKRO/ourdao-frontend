# Degraded-Mode Behaviour Matrix

This document describes what a member sees for every combination of the three
independent configuration axes: **contract configured**, **backend reachable**,
and **wallet connected**. It is the single source of truth for degraded-mode
behaviour — not the comments beside individual files.

## Axes

| Axis | Values |
|---|---|
| Contract | `NEXT_PUBLIC_CONTRACT_ID` set (starts with `C`) or empty |
| Backend | `NEXT_PUBLIC_BACKEND_URL` set and reachable, or absent/down |
| Wallet | Freighter connected with matching network, or disconnected |

## Matrix

| Contract | Backend | Wallet | Dashboard stats | Loan list | Loan detail | Proposals | Notifications | Activity feed | Write actions |
|---|---|---|---|---|---|---|---|---|---|
| ✅ | ✅ | ✅ | Contract + backend stats | Backend loans (full history) | Contract loan + backend history | Contract proposals | Backend notifications | Backend events | Enabled |
| ✅ | ✅ | ❌ | Contract + backend stats | Backend loans (full history) | Contract loan + backend history | Contract proposals | — | Backend events | Disabled (no wallet) |
| ✅ | ❌ | ✅ | Contract on-chain stats | Empty list | Contract loan only | Contract proposals | — | — | Enabled |
| ✅ | ❌ | ❌ | Contract on-chain stats | Empty list | Contract loan only | Contract proposals | — | — | Disabled (no wallet) |
| ❌ | ✅ | ✅ | Backend stats only | Backend loans | Backend loan | — | Backend notifications | Backend events | Disabled (no contract) |
| ❌ | ✅ | ❌ | Backend stats only | Backend loans | Backend loan | — | — | Backend events | Disabled (no contract) |
| ❌ | ❌ | ✅ | Empty / zero | Empty list | Empty | — | — | — | Disabled (no contract) |
| ❌ | ❌ | ❌ | Empty / zero | Empty list | Empty | — | — | — | Disabled (no contract) |

### Notes

- **Contract** = the Soroban contract is deployed and `NEXT_PUBLIC_CONTRACT_ID` is
  set to a valid `C…` address. Checked by `isContractConfigured()` in
  `src/lib/stellar.ts`.
- **Backend** = `NEXT_PUBLIC_BACKEND_URL` is set and the indexer API is reachable.
  Checked by `isBackendConfigured()` in `src/lib/backend.ts`. Every backend
  fetch call fails soft — returns the fallback (`null`, `[]`, or `false`) on
  network error, non-2xx, or missing config.
- **Wallet** = the Freighter extension is installed, the user has connected, and
  the wallet's network matches `NETWORK_PASSPHRASE`. Write actions require a
  connected wallet; reads do not.

## Distinguishable vs. indistinguishable degraded states

| Degraded state | Looks identical to | Distinguishable? |
|---|---|---|
| Contract ✅ / Backend ❌ / Wallet ✅ — empty loan list | Wallet ✅ / no loans yet | **No.** Both show an empty list. The backend-only view currently provides no badge or label indicating "backend offline". |
| Contract ❌ / Backend ❌ — everything empty | Fresh install with no data | **No.** All counters show zero, all lists empty. The "not configured" banner only appears when the contract is missing; without the backend there is no separate indicator. |
| Contract ✅ / Backend ❌ — loan detail shows contract data only | Contract ✅ / Backend ✅ / wallet has no loans | Partially — the backend-specific fields (interest charge, repaid amount) are absent, but there's no label saying "backend offline". |

**Follow-up gaps:** The "empty loan list" case (#1 above) should surface a
distinct "backend unavailable" state rather than silently showing nothing. The
"everything empty" case (#2) could show a connection-status banner. These are
tracked as separate issues.

## Test coverage

See `test/degradation-modes.test.tsx` for the test suite covering these
combinations. Each test mocks the contract and backend at the module boundary
to simulate the degraded state and asserts the expected UI outcome.
