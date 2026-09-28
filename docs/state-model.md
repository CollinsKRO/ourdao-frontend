# State Model and Query-Key Conventions

This document describes where state lives in the OurDAO frontend and the
conventions for reading, writing, and invalidating it. Every new hook or
component should follow these rules.

## Where state lives

| Mechanism | What belongs here | Examples |
|---|---|---|
| **TanStack Query cache** | All server-derived data: contract reads, backend API responses, IPFS content | Loan lists, proposal lists, member stats, wallet-scoped loan/vote data, document content |
| **React context** | Wallet connection state and signing | `WalletContext` in `src/lib/wallet.tsx` |
| **Component-local `useState`** | UI-only ephemeral state: form inputs, open/closed, animation state | Modal open, form field values, draft proposal text |
| **URL / search params** | Persistent filter/sort/pagination state that should survive refresh | Page number, sort order, active tab |
| **`next-themes`** | Theme preference | Light/dark mode, persisted in `localStorage` |

### Rules

- **Don't add manual `fetch`-in-`useEffect` data loading.** That pattern is
  being removed, not added to. All data fetching goes through TanStack Query.
- **Don't store server-derived data in `useState`.** If it comes from the
  contract or backend, it belongs in the query cache.
- **Don't store wallet state in the query cache.** Wallet connection is
  context — the cache holds wallet-*scoped* data (data that varies by address),
  not the address itself.

## Query-key convention

Query keys are centralised in `src/lib/query-keys.ts`. Every key follows a
prefix-first pattern for hierarchical invalidation:

```ts
queryKeys.userData(address)    // ['userData', address]
queryKeys.userLoans(address)   // ['userLoans', address]
queryKeys.hasVoted(kind, id, address) // ['hasVoted', kind, id, address]
```

### Wallet-scoped keys must carry the address

Any query whose result depends on which wallet is connected **must** include the
address in its key. This is the rule whose absence caused the invalidation gaps
fixed in earlier PRs. When the wallet switches, `allWalletScopedQueryKeys()`
returns all prefixes that need invalidation — if your key isn't in that list,
stale data from the previous account will linger.

```ts
// ✅ Correct — carries address
queryKeys.userLoans(address)

// ❌ Wrong — no address, stale after account switch
['userLoans']
```

### Disabled-state keys

When a query should not run (e.g. no wallet connected), use a `*Disabled`
variant with `null` as the address:

```ts
queryKeys.userLoansDisabled()  // ['userLoans', null]
```

Query keys with `null` as the address are never refetched and never
invalidated — they exist so the disabled query has a stable identity.

## When to use a query vs. a mutation

### Use a query when:

- The data is read from the contract, backend, or IPFS
- It should be cached and shared across components
- It can be refetched automatically (stale-while-revalidate)
- Multiple components may read the same data

```ts
useQuery({
  queryKey: queryKeys.userLoans(address),
  queryFn: () => fetchLoans(address),
  enabled: !!address,
})
```

### Use a mutation when:

- The action requires a user signature (write to contract)
- It's a one-shot operation, not cacheable data
- The result is a success/failure signal, not a dataset
- It couples a user action (password entry) with a non-cacheable fetch

```ts
// Encrypted doc: download + decrypt in one call, keyed by password
useMutation({
  mutationFn: (password: string) => downloadFromIPFS(hash, true, password),
})
```

This is the pattern documented in `src/hooks/useDocument.ts:3–12` — the
unencrypted path uses a query (automatic, cacheable), while the encrypted path
uses a mutation (password-dependent, one-shot).

## Invalidation convention for writes

`useWriteAction()` in `src/hooks/dao/writes.ts` handles invalidation after
every successful write. The convention:

1. The write action specifies which query keys it affects (e.g.
   `queryKeys.loanProposalsAll()`, `queryKeys.userData(address)`).
2. After the transaction confirms, `queryClient.invalidateQueries({ queryKey })`
   is called for each affected key.
3. Optimistic updates are applied before submission and rolled back on failure.

**When adding a new write action:** list the query keys it affects in the
`invalidateKeys` array passed to `useWriteAction().run()`. If you forget, the
UI will show stale data until the next manual refresh.

## CONTRIBUTING reference

See the "Frontend-specific rules" section of [CONTRIBUTING.md](../CONTRIBUTING.md)
for the positive rules (TanStack Query for all data fetching, no manual
fetch-in-useEffect). This document provides the detailed rationale and
conventions behind those rules.
