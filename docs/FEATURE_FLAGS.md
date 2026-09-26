# Feature Flags

A feature flag lets one risky or unfinished change ship **dark** — in the
bundle, but switched off — so turning it on is a separate, reversible step and
turning it back off doesn't require finding and reverting the change that
introduced it (#274).

`src/lib/feature-flags.ts` is the only place that reads the env var, and
`isFeatureEnabled(name)` is the only thing app code should call.

## Using a flag

```tsx
import { isFeatureEnabled } from '@/lib/feature-flags'

const showFastRepay = isFeatureEnabled('fast-repay')
```

Flags are off unless the name is listed in `NEXT_PUBLIC_FEATURE_FLAGS`, a
comma-separated list:

```bash
# .env.local — local development
NEXT_PUBLIC_FEATURE_FLAGS=fast-repay
```

```
# hosting dashboard (production)
NEXT_PUBLIC_FEATURE_FLAGS=fast-repay,loan-repayment-partial
```

Names are lower-cased and trimmed before comparison, so `Fast-Repay` in a
dashboard still matches `fast-repay` in code. Anything unrecognised — a typo, a
flag that no longer exists — reads as off.

## Adding a flag

1. **Add the flag to `FEATURE_FLAGS` in `src/lib/feature-flags.ts`.** That object
   is the registry of in-flight flags: the name, one line on what it gates, and
   the issue that introduced it. Declaring it here is what makes the flag
   discoverable, and `test/feature-flags.test.ts` fails if a name is used in
   code without being declared, or declared without a row in the table below.
2. **Gate the change at the boundary**, not scattered through the component:

   ```tsx
   {isFeatureEnabled('fast-repay') ? <FastRepayForm /> : <ExistingRepayForm />}
   ```

   A flag that only hides a label, or that switches behaviour inside a branch
   halfway down a render, is not shippable-disabled — every branch is still
   reachable in review and untested in production.
3. **Cover both states in tests.** Assert the default (off) path, and set the
   flag with `vi.stubEnv('NEXT_PUBLIC_FEATURE_FLAGS', …)` + `vi.resetModules()`
   for the on path. See `test/feature-flags.test.ts`.
4. **Note it in the PR description** and, if a member can reach the flagged
   state at all, in the `## [Unreleased]` section of `CHANGELOG.md`.
5. **Update this document** with the flag's entry in the table below.

## Removing a flag

A flag is temporary. Once the change has been on in production long enough to
trust it, delete the flag, the branch, and the registry entry in the same PR —
don't leave a permanent switch. If the change turns out to be wrong, see
[ROLLBACK.md](ROLLBACK.md) instead of removing the flag.

## Rules

- **Default off, always.** An unset, empty, or misspelled name must leave the
  previous behaviour in place. Flags add behaviour; they never remove it.
- **One flag per change.** Two flags in one branch produces two states nobody
  tests.
- **Flags are build-time.** `NEXT_PUBLIC_*` values are inlined by the bundler,
  so flipping a flag is a rebuild and redeploy — roughly a couple of minutes on
  Vercel, longer on a self-hosted rebuild. It is much faster than shipping a
  revert commit and hunting for the bug in the meantime, but it is not an
  instant kill switch.
- **Don't use a flag for anything that has to be revocable in seconds.** A bug
  in a signed write, a key leak, or a contract incident is handled by pausing
  the contract from `/admin` (see [ROLLBACK.md](ROLLBACK.md)) or by reverting
  the deploy, not by a flag.
- **Don't gate on a member's identity.** Flags are build-wide. Per-member or
  per-wallet behaviour is a contract read (or a backend read), not a flag.
- **A flag with no PR closing it is a bug.** If the flag is still off a release
  later, the "risky" part was never validated and the code is dead weight.

## Flags in flight

| Flag | Gates | Issue | Added | State |
|---|---|---|---|---|
| _(none)_ | — | — | — | — |

An empty table is the normal state. Add a row when you add a flag, and delete
the row when you remove it.

## Environment

| Variable | Purpose | Default |
|---|---|---|
| `NEXT_PUBLIC_FEATURE_FLAGS` | Comma-separated names of flags to enable in this build | _(empty → all flags off)_ |

This is a build-time value: see
[Build-time vs runtime variables](DEPLOYMENT.md#build-time-vs-runtime-variables).
