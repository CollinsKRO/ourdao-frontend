/**
 * Build-time feature flags (#274).
 *
 * A flag is a name that gates one risky or unfinished change so it can ship
 * dark. The flagged code is in the bundle, but `isFeatureEnabled('x')` is false
 * until someone lists `x` in `NEXT_PUBLIC_FEATURE_FLAGS`, so members see the
 * previous behaviour and nothing has to be reverted if the change turns out to
 * be wrong.
 *
 * These are not a general configuration mechanism: they are a temporary,
 * per-change lever. Every flag is off by default and is expected to be deleted
 * once the change has been validated — see `docs/FEATURE_FLAGS.md` for the
 * policy and `docs/ROLLBACK.md` for the procedure that leans on it.
 *
 * Flags are build-time only. `NEXT_PUBLIC_*` values are inlined by the bundler,
 * so flipping one is a rebuild and redeploy, not a runtime toggle. Where a
 * change has to be revocable *without* a deploy, the contract is the lever
 * (pause / unpause from the admin page), not a flag.
 */
import { logger } from '@/lib/logger'

/**
 * The env var holding the comma-separated names of the flags to enable.
 * Documented as a constant so docs and tests can't drift from the literal.
 */
export const FEATURE_FLAGS_ENV_VAR = 'NEXT_PUBLIC_FEATURE_FLAGS' as const

/** What a flag entry in the registry records. */
export interface FeatureFlagDefinition {
  /** One line on what the flag gates. */
  gates: string
  /** The issue that introduced the flagged change. */
  issue?: number
}

/**
 * The registry of flags in flight. Add an entry when you gate a change and
 * delete it in the same PR that removes the flag — a flag that outlives the
 * change it gated is dead code with an extra failure mode.
 *
 * Empty is the normal state; `test/feature-flags.test.ts` keeps it in sync with
 * the table in `docs/FEATURE_FLAGS.md` and with every `isFeatureEnabled()` call
 * site under `src/`.
 */
export const FEATURE_FLAGS = {
  // 'fast-repay': { gates: 'The one-field repay form on /loans/[id]', issue: 281 },
} as const satisfies Record<string, FeatureFlagDefinition>

/**
 * Parse a flag list.
 *
 * Names are comma-separated. Entries are trimmed and lower-cased, blanks are
 * dropped, and duplicates collapse — flag lists are typed by hand into hosting
 * dashboards, so `Repay-Flow` and `repay-flow` should mean the same thing rather
 * than silently leaving a change switched off in production.
 */
export function parseFlagList(raw: string | undefined | null): string[] {
  const names = new Set<string>()
  for (const entry of (raw ?? '').split(',')) {
    const name = entry.trim().toLowerCase()
    if (name) names.add(name)
  }
  return [...names]
}

/**
 * Flags enabled in this build.
 *
 * The env read has to be the literal `process.env.NEXT_PUBLIC_FEATURE_FLAGS`
 * member expression: Next.js inlines `NEXT_PUBLIC_*` by statically replacing
 * those expressions, so a computed lookup (indexing `process.env` with a
 * variable) arrives in the browser as `undefined` and every flag reads as off.
 * `test/feature-flags.test.ts` guards the literal against that regression.
 */
export const ENABLED_FLAGS: ReadonlySet<string> = new Set(
  parseFlagList(process.env.NEXT_PUBLIC_FEATURE_FLAGS)
)

/** Whether `name` is in the registry — i.e. is a flag this codebase knows about. */
export function isDeclaredFlag(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(FEATURE_FLAGS, name.trim().toLowerCase())
}

/**
 * Whether `flag` is enabled in this build. Always false for an unset, empty, or
 * misspelled flag name — the safe direction to fail, and the reason a flag is
 * only ever used to *add* behaviour, never to remove it.
 */
export function isFeatureEnabled(flag: string): boolean {
  return ENABLED_FLAGS.has(flag.trim().toLowerCase())
}

// A flag enabled in the environment but absent from the registry is almost
// always a typo in a hosting dashboard, and the symptom is a change that looks
// enabled but isn't. Out of production only: in a deployed build this would be
// console noise in every member's browser for something they can't act on.
if (process.env.NODE_ENV !== 'production') {
  for (const name of ENABLED_FLAGS) {
    if (!isDeclaredFlag(name)) {
      logger.warn(
        `[FeatureFlags] "${name}" is enabled in ${FEATURE_FLAGS_ENV_VAR} but not declared ` +
          'in FEATURE_FLAGS (src/lib/feature-flags.ts) — no code will act on it.',
      )
    }
  }
}
