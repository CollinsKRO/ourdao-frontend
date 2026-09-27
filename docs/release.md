# Release process

This app is deployed continuously: every merge to `main` is built and shipped. There are no release branches, release PRs, or versioned artifacts — so what does a "release" mean, and when does the version move?

## What a release is

A **release is a merge to `main` that ships.** The build identifier stamped into every bundle (see `src/lib/build-info.ts`) is the real release marker: version, commit, build time, and the configured contract id. Two deployments that differ in any of those are different releases.

The `version` field in `package.json` is the human-facing shorthand for "roughly how far along the app is" — not a shipping gate.

## When the version moves

Keep it boring and manual — automation would make it meaningless, since almost every merge ships:

- **Bump the minor** when a PR adds member-visible functionality: a new page, a new action, a new contract entrypoint wired up. One bump per release wave, not per PR.
- **Bump the patch** for visible fixes with no new functionality.
- **Don't bump** for refactors, CI changes, docs, or test-only changes. That's what the commit sha in the build badge is for.

The reviewer asks for the bump in review when it's missing — same as asking for a test. Don't open a separate "bump version" PR.

## Identifying a build

The badge in the app header (next to the network badge) shows version, commit, build time, and the configured contract id; clicking it opens the full identifier with a copy button. **A bug report should paste that identifier.** "The dashboard showed the wrong number yesterday" is unreproducible without it — the app also depends on a backend and a contract, so the combination is what pins a deployment.

CI stamps `OURDAO_BUILD_COMMIT` (the checked-out sha) and `OURDAO_BUILD_TIME` (the run's start timestamp) into `next build`; `next.config.ts` inlines them, with the version from `package.json`, as `NEXT_PUBLIC_BUILD_*` variables.

## What a release is not

- **No changelog gate.** A changelog (tracked separately) reads the same version; it stays meaningful because the version only moves for member-visible changes.
- **No staging phase.** Mainnet deploys follow a contract redeploy and its own process in [`ourdao-contracts`](https://github.com/ourdao-contracts); this app is config (a `NEXT_PUBLIC_CONTRACT_ID` change), not a coordinated release.
- **No rollback procedure.** Continuously-deployed static builds roll back by redeploying an earlier commit — the build identifier tells you which one. A documented rollback runbook lives upstream if one becomes necessary.
