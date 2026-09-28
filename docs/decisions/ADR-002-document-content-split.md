# ADR-002: `useDocumentContent` splits query and mutation

**Date:** 2026-09-24
**Status:** Accepted
**Deciders:** Maintainers

## Context

Loading a document's content from IPFS has two paths:

1. **Unencrypted:** The content hash uniquely identifies the document. Fetch it
   once, cache by hash, and any subsequent access is a cache hit. This is a
   classic read — `useQuery` is the right primitive.

2. **Encrypted:** Decryption requires a user-supplied password. The ciphertext
   fetch and the decrypt are coupled into one call (`downloadFromIPFS` with
   `decrypt: true`) because there's no separately-cacheable ciphertext step.
   The password changes the output, so the result cannot be cached across
   password entries. This is a one-shot user action — `useMutation` is the
   right primitive.

## Decision

Model the unencrypted path as a `useQuery` (automatic, cacheable, keyed by
content hash + address) and the encrypted path as a `useMutation` (triggered
by the user, keyed by the password at call time). The hook returns a unified
interface (`content`, `loading`, `error`, `decrypt`) regardless of which path
is active.

## Consequences

- Encrypted docs require the user to re-enter their password on each session
  (the mutation result is not persisted across page loads). This is the correct
  security tradeoff — caching a decrypted document would persist plaintext in
  the query cache.
- The reasoning is documented in `src/hooks/useDocument.ts:3–12` and now also
  in this ADR.

**Code reference:** `src/hooks/useDocument.ts:3–12`
