# Rollback / Roll-Forward Runbook (#275)

What to do when a deploy of `ourdao-frontend` is wrong, in the order you should
try things, with an explicit account of what *cannot* be rolled back.

Nobody should be inventing this procedure while the app is broken. Read the
decision table first, pick a lane, and follow it.

## Decision table

| What went wrong | Lane | Time to safe |
|---|---|---|
| A change shipped behind a [feature flag](FEATURE_FLAGS.md) and the flagged behaviour is bad | **A — flag off** | One rebuild + redeploy |
| An unflagged commit reached `main` and the last known-good build is still deployable | **B — redeploy the last good build** | One redeploy (2–5 min on Vercel) |
| You know the cause, and a fix is smaller or safer than a revert | **C — roll forward** | As long as the fix takes |
| Signed writes are misbehaving for everyone, and the cause isn't a frontend bug | **D — pause the contract** | Seconds, one signature |
| Anything is wrong **on-chain** (wrong state written, funds moved, a bad contract deploy) | **Not reversible from this repo** | See [What can't be rolled back](#what-cant-be-rolled-back) |

Rule of thumb: **A, then B, then C.** Prefer the smallest reversible action. Use
D only when the contract itself is the problem, because pausing stops every
member, not just the affected flow.

## Before you touch anything

1. **Identify the bad build.** The version and commit are shown at the foot of
   the app sidebar (`buildLabel()` in `src/lib/build-info.ts`). Get that SHA —
   it's what you revert to, and what you name in the incident issue.
2. **Check whether the bad behaviour is already behind a flag.** If it is, Lane A
   is strictly faster and doesn't require a revert commit.
3. **Decide if writes are affected.** If members can sign a transaction that does
   damage, go to Lane D *first*, investigate afterwards. Reads can wait; funds
   and state can't.
4. **Open an issue.** Even for a 5-minute revert. The cause, the SHA, and the
   fix belong somewhere durable.

## Lane A — Turn the feature flag off

The right move when the bad change shipped dark behind a flag. Nothing to
revert; the code stays, the behaviour goes.

1. Remove the flag name from `NEXT_PUBLIC_FEATURE_FLAGS` in the hosting
   dashboard (or the `.env` file for a self-hosted deployment).
2. Redeploy. **This step is not optional** — `NEXT_PUBLIC_*` values are inlined
   at build time, so changing the env var alone changes nothing for members.
3. Confirm: load the affected route and check the old behaviour is back.

Because the flag is off by default and the flagged branch is still fully
reviewable in the diff, this is why a risky change ships behind one at all —
see [FEATURE_FLAGS.md](FEATURE_FLAGS.md).

## Lane B — Redeploy the last known-good build

The right move when an unflagged commit broke something and the previous deploy
is still good. This is a build-level rollback, not a `git revert` — you're
redeploying a known-good artefact, which is faster and doesn't touch `main`.

**On Vercel (or any host with deployment history):**

1. Open the project's Deployments list.
2. Find the last deployment whose build you trust (cross-check the SHA against
   `CHANGELOG.md` and any incident issue).
3. **Promote / redeploy** that build to production. This does not run a new
   build; it re-serves the existing artefact, so it can't pick up new breakage.
4. Confirm the build label in the sidebar matches the SHA you intended.

**Self-hosted (Docker):**

```bash
# Redeploy the previous image tag, not a rebuilt one.
docker pull <registry>/ourdao-frontend:<last-good-tag>
docker run -p 3000:3000 --env-file .env.production <registry>/ourdao-frontend:<last-good-tag>
```

**Then fix forward properly.** A redeployed old build is a mitigation, not a
resolution: the bad commit is still on `main` and will redeploy on the next push.
Follow up with a Lane C fix — or a `git revert` commit if that's genuinely the
right answer — so the next deploy isn't the bad build again.

**If there is no known-good build to go back to** (bad deploy was the first
release, or every build since is suspect), go straight to Lane C.

## Lane C — Roll forward

The right move when the cause is understood and the fix is smaller and safer
than a revert — which is most of the time, because a `git revert` re-applies
every other change that happened to ship in the bad build.

1. Branch from `main`, fix the cause, add a regression test that fails without
   the fix.
2. Add a `## [Unreleased]` entry to `CHANGELOG.md` if a member could notice.
3. Ship it as a normal PR — the four CI checks apply, and it goes through review
   like any other change.
4. Link the fix to the incident issue in the PR description.

## Lane D — Pause the contract

The frontend is not the right lever for a contract-level incident. The contract
has a `pause` entrypoint that blocks every state-changing operation for all
members, and the admin page at `/admin` calls it (`useAdminActions().pause()` in
`src/hooks/dao/writes.ts`).

1. An admin opens `/admin` and clicks **Pause**, signs, and confirms.
2. Members see a clear "the DAO is currently paused" error on write actions
   (error code 6, mapped in `src/lib/contract-errors.ts`); reads keep working.
3. Fix the root cause in the contract or the frontend.
4. Unpause from the same page once it's safe. Confirm the "Contract is Active"
   badge in the admin panel flips back.

Pause is a real hammer: it stops every member from registering, voting, staking,
requesting, and repaying. Don't reach for it because a single flow is
misbehaving — use Lane A or B for that.

## What can't be rolled back

Being clear about this up front prevents the worst outcome: reaching for a
frontend rollback to "undo" something that happened on-chain.

- **On-chain state.** A transaction that was signed and confirmed is final. If
  the bad deploy caused a member to sign something wrong, redeploying the app
  doesn't undo it. You can only add a corrective transaction (which usually means
  an admin action) or pause until a human has looked.
- **A deployed contract.** Soroban contracts are immutable — there is no
  "revert". A bad contract means deploying a new one, and then the frontend has
  real work to do. See
  [CONTRACT-REDPLOYMENT.md](CONTRACT-REDPLOYMENT.md).
- **The backend indexer.** `ourdao-backend` keeps its own state and history. A
  frontend rollback doesn't reindex anything, and the UI will happily render
  stale backend-derived data (loan history, notifications, activity feed) —
  see the "distinguishable vs. indistinguishable" cases in
  [degradation-matrix.md](degradation-matrix.md).
- **A user's cached bundle.** A member with the PWA installed may keep a
  service-worker-cached shell. The service worker (`public/sw.js`) is
  network-first, so a member who reloads gets the new build; one who is fully
  offline keeps the old one until they reconnect. There's no forced
  cache-busting step here — that's a known gap, not something to improvise
  during an incident.

## After

- Land the Lane C fix (or a `git revert`) so `main` is not still broken.
- Update the incident issue with: the bad SHA, the lane you took, the fix PR, and
  the `CHANGELOG.md` entry if a member noticed.
- If the runbook was wrong or incomplete at any point, fix this file in the same
  PR. A runbook that lied under pressure is worse than no runbook.
