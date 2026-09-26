# Unused exports & dependencies (knip)

CI runs [`knip`](https://knip.dev) to detect unused **code** — exports, types, files, and dependencies — complementing `depcheck`, which only detects unused *packages*. A new unused export fails the `knip` CI job.

This distinction has cost the repository repeatedly: #136 (fifteen unused exports in `responsive.ts`), #140 (eleven of nineteen types in `types/dao.ts`), #152 (`validateIPFSHash` never called), #40 (explorer URL helpers), #49 (900 unused lines in `DocumentUpload`/`DocumentViewer`). Every one was found by a person reading the code; knip makes CI find them instead.

## Local usage

```bash
npm run knip            # pretty terminal report
npm run knip:check      # CI mode: diff against knip-baseline.json, non-zero on drift
npm run knip:baseline   # regenerate knip-baseline.json
```

`knip:check` exits 1 on **new** findings (fix or allowlist before merging) and 2 on a **stale** baseline (an entry no longer appears — regenerate). Both are worth an early look before pushing.

CI runs `npm run knip:baseline -- --check` after `knip:check`, so a stale baseline fails too — regenerating is a deliberate, reviewed change to a committed file.

## Allowlisting an intentionally-public export

Anything consumed outside knip's visibility (tests importing directly, an export kept deliberately for an upcoming consumer, Next.js conventions it can't see) gets a `/** @public */` JSDoc tag:

```ts
/** @public Used by test/utils.test.ts directly */
export function formatAddress(address: string): string { ... }
```

knip's `@public` tag marks the export as intentionally used and it disappears from the report — no entry in the baseline, no CI failure. Prefer this over baseline entries for exports in `src/`: the reason lives next to the code.

## Baseline (knip-baseline.json)

`knip-baseline.json` records **pre-existing** findings so this PR doesn't have to fix the whole backlog, while still failing on anything **new**. It's a sorted array of `kind:file:name` strings:

- `export:src/lib/utils.ts:formatAddress` — an unused export
- `type:src/types/dao.ts:Member` — an unused type
- `dep:package.json:@radix-ui/react-avatar` — an unused dependency
- `file:src/components/ui/avatar.tsx` — a whole unused file

**Rules:**

1. Never grow the baseline. A PR that adds a line to it had better be removing three.
2. When your PR fixes a finding, delete its baseline line — `knip:check` fails with exit 2 until you do, telling you exactly which entries to drop.
3. Regenerate wholesale with `npm run knip:baseline` only when knip's output format changes or entries churn in bulk; review the diff.

### Follow-up tracker

Each baseline entry is a pending cleanup. Current items, open as issues:

- `BACKEND_URL` exported and unused (#183), `validateIPFSHash` never called (#171)
- `@radix-ui/react-avatar`, `react-dropdown-menu`, `react-hover-card`, `react-navigation-menu`, `react-separator` installed but unused — the `ui/` components that import them (`avatar.tsx`, `dialog.tsx`'s unused peers, `hover-card.tsx`, `navigation-menu.tsx`, `separator.tsx`) are themselves unused files
- `skeleton.tsx` exports nine skeleton components; only `LoadingSpinner` is used
- `contract-errors.ts` exports `CONTRACT_ERROR_MESSAGES`, `contractErrorMessage`, `parseContractErrorCode` — only `formatContractError` has callers (message-catalogue work in #268 will consume these)
- commit-reveal helpers `generateCommitment`/`storeCommitSalt`/`loadCommitSalt` in `utils.ts`
- `useDAOContract`, `useResponsiveModal`, `read` (dao-client), `DaoWrite`, `Member`
- `formatAddress` in `utils.ts` — its callers now use `formatStellarAddress` from `src/lib/stellar.ts`; deleting this variant is the follow-up

## Why a baseline script and not knip's `--include-entry-exports`/ignore flags

knip has no built-in baseline, so CI would fail on every pre-existing finding from day one — unusable. A committed baseline (one JSON file, reviewable diffs, `exit 2` when stale) is the smallest mechanism that makes "new unused code fails, existing findings tracked as follow-ups" true. It's the same shape as `bundle-size-baseline.json` in the bundle-size job.
