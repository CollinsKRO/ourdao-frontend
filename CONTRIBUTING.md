# Contributing to `ourdao-frontend`

Thanks for your interest in contributing. This repo is the Next.js web app members use to interact with OurDAO — it reads and writes the Soroban contract directly via Freighter, and pulls queryable history from the indexer.

New to the project? Start with [What this is](#what-this-is) and [Your first change](#your-first-change) below — they explain what the app does and walk you through a complete first contribution. The process rules (claiming an issue, what CI checks, what a good PR looks like) come after, under [Before you open a pull request](#before-you-open-a-pull-request).

## Table of contents

**Start here**
- [What this is](#what-this-is)
- [How it's put together](#how-its-put-together)
- [Glossary](#glossary)
- [Your first change](#your-first-change)
- [Local setup](#local-setup)

**Before you open a pull request**
- [Before you open a pull request](#before-you-open-a-pull-request)
- [Running the checks CI runs](#running-the-checks-ci-runs)
- [Changelog](#changelog)
- [What a good pull request looks like](#what-a-good-pull-request-looks-like)
- [What gets closed without review](#what-gets-closed-without-review)

**Conventions**
- [Frontend-specific rules](#frontend-specific-rules)
- [State model and conventions](#state-model-and-conventions)
- [Testing strategy](#testing-strategy)
- [Architectural decisions](#architectural-decisions)

**Reference**
- [Shipping something risky](#shipping-something-risky)
- [Deploying and rolling back](#deploying-and-rolling-back)
- [Working with the contract](#working-with-the-contract)
- [Reporting a security issue](#reporting-a-security-issue)
- [License](#license)

---

## What this is

`ourdao-frontend` is one of three repositories that make up OurDAO:

| Repo | Role |
|---|---|
| [`ourdao-contracts`](https://github.com/ourdao/ourdao-contracts) | The Soroban contract. The single source of truth for all DAO state — members, loans, proposals, treasury. |
| [`ourdao-backend`](https://github.com/ourdao/ourdao-backend) | An off-chain indexer and read API. The contract stores no queryable lists, so this repo serves loan history, notifications, and activity feeds. |
| **`ourdao-frontend`** (this repo) | The web app members actually use. Reads and writes the contract through a browser wallet extension (Freighter). |

The single most important thing to understand before changing anything: **the contract owns the data, and this app is a client of it.** There is no database behind this UI. A number you see on screen came from a contract read or an indexed event — never from a constant in this repo. That's why a redeploy of the contract can require changes here even when nothing about the UI moved (see [Working with the contract](#working-with-the-contract)).

The app never holds a private key. Every signature happens inside the Freighter extension in the member's own browser; this repo only ever receives a signed transaction back.

## How it's put together

```
src/
  app/            Routes. (app)/ holds the pages behind the shared AppShell;
                  the landing page and /register sit outside it with their own headers.
  components/     Shared UI — AppShell, ConnectButton, NotificationCenter, and
                  the shadcn/ui-derived primitives in ui/.
  hooks/          useDAO.ts (contract reads/writes as React Query hooks),
                  useNotifications.ts (backend polling), useNow.ts (a clock for countdowns).
  lib/            stellar.ts (network config), wallet.tsx (Freighter),
                  dao-client.ts (every contract read/invoke), backend.ts, ipfs.ts, utils.ts.
  constants/      Label maps and pre-load fallbacks for values the contract owns.
docs/             Deeper reference — state model, testing, deployment, decisions.
```

Four ideas cover most of the codebase:

- **The wallet/signing boundary** lives in `src/lib/wallet.tsx` and
  `src/lib/dao-client.ts`. If you're touching either, read
  [Frontend-specific rules](#frontend-specific-rules) first.
- **Data fetching is TanStack Query, everywhere.** The contract has no
  queryable lists, so the app enumerates from the backend and then fetches each
  item live from the contract by id.
- **Contract call signatures are hand-written** in `src/lib/dao-client.ts` to
  match a specific contract build. There is no runtime ABI check — a mismatch
  fails at a member's signature time, not in CI. `contract/interface.json`
  records which build we're pinned to.
- **Styling uses semantic tokens** (`bg-card`, `text-muted-foreground`) defined
  in `src/app/globals.css`, and must work in both light and dark.

You don't need to memorise any of this to make a first change. It's here so
that when you open a file, you can tell what kind of file it is.

## Glossary

| Term | Meaning |
|---|---|
| **DAO** | The member-owned treasury this app manages. |
| **Soroban** | Stellar's smart-contract platform. The OurDAO contract runs on it. |
| **Freighter** | The browser wallet extension members use. The app never sees a private key. |
| **Stroops** | Stellar's smallest token unit. 1 token = 10,000,000 stroops. Amounts are handled as `bigint` to avoid precision loss. |
| **Entrypoint** | A public function on the contract (a "read" or a "write"). The frontend calls these by name. |
| **Indexer / backend** | The off-chain service that watches the chain and serves queryable history the contract doesn't store. |
| **Degraded mode** | What the UI shows when something isn't configured or reachable — an explicit "not configured"/empty state, never a crash. |
| **Feature flag** | An env-driven switch that lets a risky change ship switched off. See [Shipping something risky](#shipping-something-risky). |

## Your first change

A complete, low-risk path from nothing to an open pull request:

1. **Find something small.** Look for issues labelled `good first issue`, or
   pick a small unassigned bug and comment to claim it first (see
   [Before you open a pull request](#before-you-open-a-pull-request)). A docs
   fix or a small component tweak is a perfectly good first contribution.
2. **Get it running locally** — [Local setup](#local-setup) below. You do *not*
   need a deployed contract or a running backend: with no
   `NEXT_PUBLIC_CONTRACT_ID` the app still renders in an explicit
   "not configured" state, which is perfect for pure-UI work.
3. **Make the change**, following [Frontend-specific rules](#frontend-specific-rules).
   If it touches logic, add a test that fails without it.
4. **Run the checks** — [Running the checks CI runs](#running-the-checks-ci-runs).
5. **Open the pull request** using the template in
   `.github/PULL_REQUEST_TEMPLATE.md`. Fill in *why*, not just *what*, and check
   the boxes.

If you get stuck or find a second problem, that's normal — open a second issue
for the second problem rather than bundling it (see
[What a good pull request looks like](#what-a-good-pull-request-looks-like)).

## Local setup

You need Node.js 20.9+ (22 and 24 are also tested in CI) and the [Freighter](https://www.freighter.app/) browser extension to test anything wallet-connected.

**Node version:** This repo pins Node to version 20 via `.nvmrc`. If you use [nvm](https://github.com/nvm-sh/nvm), [fnm](https://fnm.io/), or [asdf](https://asdf-vm.com/), it will automatically select the right version when you enter the directory.

```bash
git clone https://github.com/ourdao/ourdao-frontend
cd ourdao-frontend
npm install
cp .env.example .env.local     # all values optional; testnet defaults
npm run dev
```

Open http://localhost:3000.

Everything is env-driven with public-testnet defaults. Without a `NEXT_PUBLIC_CONTRACT_ID`, the UI renders in an explicit "not configured" state rather than erroring — useful for pure UI work. Without a reachable backend, backend-derived data (loan history, notifications, activity logs) degrades to empty rather than throwing. See the [README](./README.md#configuration) for the full variable list.

---

## Before you open a pull request

**Claim the issue first.** Comment on the issue you want to work on and wait to be assigned before opening a pull request. This prevents duplicate work and gives us a chance to flag context that isn't in the issue text.

Pull requests that arrive without an assigned issue will be closed with a pointer back here. The one exception is a genuine security fix, which should follow [Reporting a security issue](#reporting-a-security-issue) instead.

If you think something should change but there's no issue for it, open one and describe the problem before writing the fix.

## Running the checks CI runs

CI runs exactly these, and a pull request that fails any of them will not be merged:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`tsc --noEmit` is fully clean and enforced — please keep it that way rather than reaching for `any` or `@ts-expect-error`.

## Changelog

If your change is something a member would notice (a new or removed feature, a changed number, label, or flow, a fixed bug they could hit), add a line under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) in the same PR. Refactors, tests, CI, and docs don't need one.

If your change targets a different `ourdao-backend` or `ourdao-contracts` build, also update the `Backend:` / `Contracts:` lines under Unreleased. The contracts line must match `_last_verified` in `contract/interface.json`, and a test enforces that. These lines are what let a bug report, which names the version shown in the app sidebar, be traced to a combination of versions.

## What a good pull request looks like

- **It's scoped to one issue.** If you find a second problem while working, open a second issue. Don't bundle.
- **It includes a test that would fail without your change**, where the change affects logic. Pure visual/layout changes are the reasonable exception — say so in the description, and include a before/after screenshot instead.
- **It doesn't reformat code you didn't change.**
- **Its description explains why, not just what.**
- **CI is green** before you request review.
- **It gets reviewed by the relevant code owner.** `.github/CODEOWNERS` maps paths to reviewers and GitHub will request that review automatically when you open the PR. As of this writing every path resolves to the same placeholder owner (see the note at the top of that file) — that will change as the maintainer team grows, but the path structure and the expectation that sensitive paths (API routes, the wallet/signing boundary, contract call signatures, security headers) get an explicit reviewer stays the same regardless of who's listed.

## What gets closed without review

- Pull requests against an unassigned or unclaimed issue.
- Formatting-only, whitespace-only, or comment-typo-only changes.
- Unrelated dependency bumps bundled into a feature or fix.
- Generated or AI-authored changes whose author can't explain the diff when asked in review. The policy is outcome-based, not tool-based — use whatever tools you like, but you're accountable for understanding and defending what you submit.
- Logic changes with no accompanying test.
- Anything that introduces placeholder, sample, or fabricated user-facing content (see above).

---

## Frontend-specific rules

- **No fabricated content, ever.** Every number, status, name, and history entry shown in the UI must come from a real contract read or a real indexed event. No placeholder testimonials, invented statistics, hardcoded "sample" members, or fake risk scores — not even temporarily, not even behind a TODO. This has been actively enforced by removing such content from this codebase, and a PR that reintroduces it will be rejected on that basis alone.
- **Data fetching goes through TanStack Query.** Contract reads/writes belong in `src/hooks/useDAO.ts`; backend reads belong in `src/hooks/useNotifications.ts` / `src/lib/backend.ts`. Don't add manual `fetch`-in-`useEffect` data loading — that pattern is being removed, not added to.
- **The frontend never touches a private key.** Every signature happens inside the Freighter extension. `src/lib/wallet.tsx` only ever receives a signed XDR back. A PR that introduces key handling, seed phrase input, or in-app signing will be rejected regardless of quality.
- **Use `cn()` from `src/lib/utils.ts` for class composition.** It runs through `tailwind-merge`, not just `clsx`, so a caller's override actually wins over a component's default variant classes. Concatenating class strings by hand reintroduces a class of bug where which style applies depends on Tailwind's generated stylesheet order — this repo has already been bitten by exactly that.
- **Style with the semantic tokens, not raw colors, where a token exists.** `bg-card`, `text-muted-foreground`, `border-border`, etc. are defined in `src/app/globals.css` with a `.dark` override block. Anything new must work in **both** light and dark — check both before opening the PR.
- **Respect the `useSyncExternalStore` contract if you touch `useNow.ts` or write a similar hook.** `getSnapshot` must return a stable value between real store changes. Returning a fresh value on every call (e.g. `Date.now()`) causes an infinite render loop. There's a regression test covering this; don't work around it.
- **Contract call signatures live in `src/lib/dao-client.ts`.** If [`ourdao-contracts`](https://github.com/ourdao/ourdao-contracts) changes an entrypoint, that's the file to update. Note the contract commit in your PR description.
- **Icons: `lucide-react` only.** This matches the shadcn/ui convention `src/components/ui/` is already built from. `@heroicons/react` is being migrated out file-by-file (tracked in #47) — don't add new imports from it, and if you touch a file that still uses it, swap it to the closest `lucide-react` equivalent as part of your change rather than leaving it mixed.

## State model and conventions

State is split across four mechanisms with clear rules for each. See [docs/state-model.md](docs/state-model.md) for the full reference.

- **TanStack Query cache** — all server-derived data (contract reads, backend API, IPFS content). No manual `fetch`-in-`useEffect`.
- **React context** — wallet connection state only (`src/lib/wallet.tsx`).
- **Component-local `useState`** — UI-only ephemeral state (form inputs, modals).
- **URL params** — persistent filter/sort/pagination that should survive refresh.

**Query-key rule:** wallet-scoped keys must carry the address. See `src/lib/query-keys.ts` and `docs/state-model.md`.

**Write invalidation:** all write actions specify which query keys they affect via `useWriteAction().run()`. If you add a new write and forget to list affected keys, the UI will show stale data.

## Testing strategy

See [docs/testing-strategy.md](docs/testing-strategy.md) for the full reference.

- **Mock at the client boundary** (`dao-client.ts`, `backend.ts`), not the hook boundary. This tests real hook logic.
- **Use `renderWithProviders`** from `test/test-utils.tsx` for page/component tests.
- **Every logic change needs a test** that fails without your change. Pure visual changes are the exception.
- Use `// @vitest-environment node` for pure-logic tests that don't need the DOM.

## Architectural decisions

Significant architectural decisions are recorded in [docs/decisions/](docs/decisions/) as short ADR records (context, decision, consequences). When making an architectural decision:

1. Create `docs/decisions/ADR-NNN-short-title.md`.
2. Reference the ADR from code comments (link, don't duplicate prose).
3. Include the ADR in your PR description.

This ensures decisions are discoverable in one place rather than scattered across comments, closed issues, and git history.

---

## Shipping something risky

If a change is risky, unfinished, or hard to reverse in production, ship it behind a feature flag so it's off by default and can be switched on — or off — independently of the code being deployed. `src/lib/feature-flags.ts` is the single place that reads the `NEXT_PUBLIC_FEATURE_FLAGS` env var; every flag is off unless listed there. [docs/FEATURE_FLAGS.md](docs/FEATURE_FLAGS.md) has the policy, the steps to add a flag, and how to remove one once the change has been validated.

## Deploying and rolling back

A frontend deploy is a build-and-redeploy; `NEXT_PUBLIC_*` values are inlined at build time, so changing one requires a rebuild. If a deploy goes wrong, [docs/ROLLBACK.md](docs/ROLLBACK.md) is the runbook — which lane to take (turn a flag off, redeploy the last good build, roll forward, or pause the contract) and what can't be rolled back at all. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the deployment mechanics themselves.

## Working with the contract

Because the contract is immutable and this app hard-codes its entrypoints, redeploying `ourdao-contracts` is a coordinated change, not a config change. [docs/CONTRACT-REDPLOYMENT.md](docs/CONTRACT-REDPLOYMENT.md) is the checklist: what has to change in this repo, in what order, how to verify it, and the CI gap that lets interface drift go unnoticed. The expected surface is pinned in `contract/interface.json` (`_last_verified`); name the contract commit in your PR description whenever you touch call signatures.

## Reporting a security issue

**Do not open a public issue for a security vulnerability.** Use GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability) on this repository.

Include what you found, how to reproduce it, and what an attacker could do with it.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE) that covers this project.
