# ADR-008: Network-mismatch behaviour — banner plus blocked writes

**Date:** 2026-09-26
**Status:** Accepted
**Deciders:** Maintainers
**Issue:** #241 (closes #241)

## Context

`networkMismatch` is derived in the wallet provider (`src/lib/wallet.tsx`):

```ts
address && walletNetworkPassphrase && walletNetworkPassphrase !== NETWORK_PASSPHRASE
```

and updated from the Freighter watcher on every poll. Closed issue #74 added
a warning banner. A warning alone does not prevent a member on the wrong
network (e.g. Mainnet while the app is configured for Testnet) from opening
the loan request form, approving the transaction in Freighter, and only then
learning it will be rejected — the transaction is built with the app's
`NETWORK_PASSPHRASE`.

`passphraseLabel` falls through to the raw passphrase for unknown networks,
and the explorer-URL helpers had the same three-network gap (Testnet vs.
everything-else-mapped-to-public).

## Decision

A network mismatch **both surfaces a banner and disables writes**:

1. **Warn (banner):** `WalletProvider` renders a `role="alert"` banner
   (`data-testid="network-mismatch-banner"`) naming Freighter's network and
   the app's expected network, with the copy
   “transactions are blocked until it matches”.
2. **Guard (block writes):**
   - `signXDR` throws before touching Freighter when `networkMismatch` is true.
   - `useWriteAction.run` rejects before any optimistic update or signer call,
     so mismatched members never reach the Freighter approval prompt.
3. **Reads stay available:** dashboards, lists, and detail pages keep working
   so members can inspect state while mismatched.
4. **Recovery is automatic:** the watcher updates `walletNetworkPassphrase` on
   every poll (and on tab-visibility resume), so switching Freighter back to
   the configured network clears `networkMismatch` and dismisses the banner
   without a reload.
5. **Unknown networks:** `passphraseLabel` returns the raw passphrase, and the
   banner falls back to `walletNetwork || passphraseLabel(...)` so an unknown
   network is still named. Explorer helpers (`getExplorerBase`) explicitly map
   Testnet / Futurenet / Public instead of a two-way testnet-vs-public
   fallback.

Out of scope: network switching itself, which Freighter owns.

## Consequences

- A mismatched write fails fast with a clear toast + thrown error, not a
  post-approval rejection.
- `test/network-mismatch.test.tsx` covers detect → warn → block → recover,
  plus the unknown-network label path. Dropping the banner or the guard fails
  the suite.
- Explorer URLs now handle Futurenet explicitly; see `src/lib/stellar.ts`.

**Code references:**
`src/lib/wallet.tsx` (`isNetworkMismatch`, `passphraseLabel`, banner,
`signXDR` guard), `src/hooks/dao/writes.ts` (`run` guard),
`src/lib/stellar.ts` (`getExplorerBase`), `test/network-mismatch.test.tsx`.
