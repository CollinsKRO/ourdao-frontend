# ADR-006: Token migration approach

**Date:** 2026-09-24
**Status:** Accepted
**Deciders:** Maintainers (from closed issue #35)

## Context

The `@heroicons/react` icon library was used early in the project but the
codebase standardised on `lucide-react` (matching the shadcn/ui convention
used by `src/components/ui/`). Some files still import from `@heroicons/react`.

## Decision

Migrate `@heroicons/react` imports to `lucide-react` file-by-file as those
files are touched for other reasons. Do not create a dedicated migration PR
that only swaps icons — each swap should be part of a meaningful change to
the file. Do not add new `@heroicons/react` imports.

## Consequences

- The migration is gradual and low-risk — each file is tested as part of its
  own PR.
- No single PR touches many files just for icon swaps, keeping review
  manageable.
- The migration is tracked in issue #47.

**Code reference:** CONTRIBUTING.md "Icons: lucide-react only"
