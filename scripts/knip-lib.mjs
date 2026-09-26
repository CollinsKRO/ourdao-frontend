// Shared logic for the knip baseline check. Pure functions, no I/O, so
// test/knip-check.test.ts can exercise them without running knip itself.
//
// Findings are flattened into "kind:file:name" strings (files become
// "file:<path>"), which makes the committed baseline (knip-baseline.json) a
// plain sorted array of strings that diffs well in review.

// Kind names mirror knip's issue types. Unmapped kinds pass through as-is so a
// surprising new category can never slip through silently — it produces diffable
// entries like any other.
const KIND_MAP = {
  dependencies: 'dep',
  devDependencies: 'dep',
  exports: 'export',
  types: 'type',
  enumMembers: 'enumMember',
  classMembers: 'member',
  duplicates: 'duplicate',
  unlisted: 'unlisted',
  unresolved: 'unresolved',
  binaries: 'binary',
}

/**
 * Flatten knip's per-file JSON issues into a Set of "kind:file:name" strings.
 *
 * knip's JSON entries carry both a `file` (string) and a `files` (array) key;
 * only the array form means "the whole file is unused" — a whole-file finding
 * becomes "file:<path>". The `file` string key is metadata, not a finding, and
 * must not be iterated (it's a string, and iterating it yields garbage).
 */
export function collect(issues) {
  const found = new Set()
  for (const entry of issues ?? []) {
    const file = entry.file
    if (Array.isArray(entry.files) && entry.files.length > 0) {
      found.add(`file:${file}`)
    }
    for (const [kind, items] of Object.entries(entry)) {
      if (kind === 'file' || kind === 'files') continue
      const label = KIND_MAP[kind] ?? kind
      for (const item of items ?? []) {
        found.add(`${label}:${file}:${item.name ?? JSON.stringify(item)}`)
      }
    }
  }
  return found
}

/**
 * Compare the current findings against the baseline.
 * `added`   — findings not in the baseline (new unused code; blocks)
 * `removed` — baseline entries no longer reported (stale baseline; warns)
 */
export function diff(current, baseline) {
  const added = []
  const removed = []
  for (const x of current) if (!baseline.has(x)) added.push(x)
  for (const x of baseline) if (!current.has(x)) removed.push(x)
  return { added: added.sort(), removed: removed.sort() }
}
