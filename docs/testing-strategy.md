# Testing Strategy

This document describes the testing layers, mocking conventions, and shared
harness for the OurDAO frontend test suite.

## Test layers

| Layer | What it tests | Where | When to use |
|---|---|---|---|
| **Unit (pure functions)** | ScVal builders, formatting helpers, mapping functions, pure validators | `test/*.test.ts` (node environment) | Any pure logic with no DOM or React dependency |
| **Hook tests** | React hooks with TanStack Query context | `test/*.test.tsx` (jsdom) + `QueryClientProvider` | Custom hooks that read/write query cache |
| **Page render tests** | Full page rendering with mocked data boundaries | `test/*.test.tsx` (jsdom) + `renderWithProviders` | Verifying a page renders correctly given mocked contract/backend state |
| **Behaviour tests** | User interactions (clicks, form submissions, drawer open/close) | `test/*.test.tsx` (jsdom) + `renderWithProviders` | Interactive flows that span multiple components |

## Mocking boundary

**Mock at the client boundary, not the hook boundary.**

This means mocking `src/lib/dao-client.ts` (contract calls) and
`src/lib/backend.ts` (API calls) — **not** the individual hooks in
`src/hooks/`. The reason: if you mock the hook, you're testing the mock. If you
mock the client, you're testing the real hook logic that processes the response.

```ts
// ✅ Correct — tests real hook + mapping logic
vi.mock('@/lib/dao-client', () => ({
  daoRead: vi.fn().mockResolvedValue(mockContractData),
}))

// ❌ Wrong — tests nothing real
vi.mock('@/hooks/useDAO', () => ({
  useLoan: vi.fn().mockReturnValue({ data: mockLoan }),
}))
```

This convention was established in closed issue #6 and should be followed for
all new page/render tests.

### Exception: wallet

`useWallet()` from `src/lib/wallet.tsx` is mocked at the hook level in most
tests because standing up a real Freighter-backed provider in jsdom is
impractical. This is the one hook-level mock that's acceptable — it's a
boundary between the test harness and the browser extension, not between the
test and the app's own logic.

## Shared harness

`test/test-utils.tsx` provides `renderWithProviders(ui)`, which wraps a
component in `QueryClientProvider` and `ThemeProvider` — the two providers every
real page gets from the root layout.

```ts
import { renderWithProviders } from './test-utils'

renderWithProviders(<MyPage />)
```

### When to extend vs. rebuild

- **Extend** `renderWithProviders` if you need an additional provider that
  future tests will also need (e.g. a new context that becomes page-level).
- **Rebuild setup** in your test file if you need a non-standard QueryClient
  config (e.g. custom `defaultOptions`, specific cache state) or a provider
  that only your test needs.

Don't add one-off providers to `renderWithProviders` — it's intentionally thin.

## What does not need a test

- Pure visual/layout changes (no logic): include a before/after screenshot
  instead.
- Third-party library internals: test your integration with them, not their
  implementation.
- Trivial re-exports or type-only files.
- Configuration files (tsconfig, postcss) unless the change affects runtime
  behaviour.

## Adding a new test

1. Create `test/<name>.test.tsx` (or `.test.ts` for pure-logic tests).
2. Import `renderWithProviders` from `./test-utils` if rendering components.
3. Mock at the client boundary (`dao-client.ts`, `backend.ts`).
4. The test should fail without your change (regression coverage).
5. Run `npm test` to verify it passes.

## Running tests

```bash
npm test          # all tests (vitest)
npm test -- --run # single run without watch mode
```

CI runs `npm test` on every push/PR. Coverage currently focuses on
`dao-client.ts` ScVal builders, `backend.ts` fetch wrappers, `useDAO.ts`
mapping helpers, `useNotifications.ts` hooks, and `useNow.ts`'s
`useSyncExternalStore` contract.
