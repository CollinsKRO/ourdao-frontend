/**
 * Build identity: which version, commit, build time, and contract id produced
 * the deployment a member is looking at (issue #269). The combination is what
 * identifies a deployment — the app depends on a backend and a contract, so a
 * bug report needs all of it to be reproducible.
 *
 * Values are inlined at build time via `env` in next.config.ts, which reads
 * the package version and two optional CI-provided variables:
 *
 * - OURDAO_BUILD_COMMIT — set by CI to the commit being built
 * - OURDAO_BUILD_TIME   — set by CI to the build's start timestamp
 *
 * Locally they're empty; the UI shows a "dev" marker rather than pretending
 * to know a commit it doesn't. See docs/release.md for when the version moves.
 */
import { CONTRACT_ID } from '@/lib/stellar'

export const BUILD_VERSION: string = process.env.NEXT_PUBLIC_BUILD_VERSION || '0.0.0-dev'
export const BUILD_COMMIT: string = process.env.NEXT_PUBLIC_BUILD_COMMIT || ''
export const BUILD_TIME: string = process.env.NEXT_PUBLIC_BUILD_TIME || ''

export interface BuildInfo {
  version: string
  commit: string
  buildTime: string
  contractId: string
}

export function getBuildInfo(): BuildInfo {
  return {
    version: BUILD_VERSION,
    commit: BUILD_COMMIT,
    buildTime: BUILD_TIME,
    contractId: CONTRACT_ID,
  }
}

/** Short display form of a commit sha ("681a7b4"). Empty stays empty. */
export function shortCommit(commit: string): string {
  return commit ? commit.slice(0, 7) : ''
}

/**
 * The one-line identifier a bug report should include, e.g.
 * `v0.1.0 (681a7b4 · 2026-09-26T12:00:00Z · CABC…WXYZ)`.
 * Absent fields are omitted rather than rendered as empty segments.
 */
export function formatBuildInfo(info: BuildInfo): string {
  const parts: string[] = []
  if (info.commit) parts.push(shortCommit(info.commit))
  if (info.buildTime) parts.push(info.buildTime)
  if (info.contractId) parts.push(info.contractId)
  const detail = parts.length > 0 ? ` (${parts.join(' · ')})` : ''
  return `${info.version}${detail}`
}

/**
 * True when the build has no identity beyond the package version — the local
 * `next dev` case. The badge marks itself so a dev screenshot is never
 * mistaken for a deployment.
 */
export function isDevBuild(info: BuildInfo): boolean {
  return !info.commit && !info.buildTime
}
