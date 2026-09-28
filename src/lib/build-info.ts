/**
 * Identifies the running build so a bug report can name it and be traced to
 * a CHANGELOG.md entry (#250). Both values are inlined at build time by
 * next.config.ts `env`; `dev` means the config didn't run (e.g. under vitest).
 */
export function buildLabel(): string {
  const version = process.env.NEXT_PUBLIC_APP_VERSION || 'dev'
  const sha = process.env.NEXT_PUBLIC_GIT_SHA
  return sha ? `v${version} (${sha.slice(0, 7)})` : `v${version}`
}
