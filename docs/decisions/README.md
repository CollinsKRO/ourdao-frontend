# Architectural Decision Records

This directory contains short records of significant architectural decisions
made in the OurDAO frontend. Each record captures the context, decision, and
consequences so that contributors can understand *why* the code is the way it
is without digging through comments, closed issues, or git blame.

## Format

Each record follows the lightweight ADR format:

```markdown
# ADR-NNN: Title

**Date:** YYYY-MM-DD
**Status:** Accepted / Superseded / Deprecated
**Deciders:** who was involved

## Context

What situation prompted this decision?

## Decision

What was decided.

## Consequences

What are the trade-offs and follow-up implications.
```

## Current ADRs

| ADR | Title |
|---|---|
| [ADR-001](ADR-001-csp-unsafe-inline.md) | CSP uses `unsafe-inline` rather than nonces |
| [ADR-002](ADR-002-document-content-split.md) | `useDocumentContent` splits query and mutation |
| [ADR-003](ADR-003-repay-loan-partial.md) | `repay_loan_partial` is a separate entrypoint |
| [ADR-004](ADR-004-rpc-propagation-delay.md) | `RPC_PROPAGATION_DELAY_MS` exists and is untested |
| [ADR-005](ADR-005-mocking-boundary.md) | Mock at client boundary, not hook boundary |
| [ADR-006](ADR-006-token-migration.md) | Token migration approach |
| [ADR-007](ADR-007-pwa-installability.md) | Whether the app should be installable (open) |

## Adding a new ADR

When making an architectural decision (anything that affects multiple files or
sets a precedent for future work):

1. Create `docs/decisions/ADR-NNN-short-title.md` with the next sequence number.
2. Use the template above.
3. Reference the ADR from the relevant code comment (link, don't duplicate).
4. Add a row to the table above.
5. Include the ADR in your PR description.
