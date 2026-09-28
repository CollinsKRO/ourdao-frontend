# ADR-001: CSP uses `unsafe-inline` rather than nonces

**Date:** 2026-09-24  
**Status:** ~~Accepted~~ **Superseded by nonce-based policy (2026-09-26)**  
**Deciders:** Maintainers

## Context

Next.js hydration requires inline `<script>` tags for its bootstrap and
hydration markers. A Content-Security-Policy that blocks inline scripts will
break the app entirely. The strictest option would be a per-request nonce
generated in middleware and wired into every inline script tag.

However, `next.config.ts`'s `headers()` function runs at build time and
applies static headers to all responses — it cannot generate per-request
nonces. Achieving a nonce-based policy would require:

1. A custom Next.js middleware that generates a random nonce per request.
2. Injecting that nonce into the CSP header *and* into every inline `<script>`.
3. Ensuring all third-party inline scripts (analytics, etc.) are also covered.

This is not achievable with the current `headers()` API alone.

## Decision

Use `'unsafe-inline'` for `script-src` and `style-src` in the CSP, and
document the tradeoff explicitly in `next.config.ts` rather than adding it
silently.

## Consequences

- The app works with Next.js hydration out of the box.
- An injected script can execute inline code, reducing the CSP's protection
  against XSS. However, `connect-src` still limits where data can be
  exfiltrated, and `frame-ancestors 'none'` prevents framing attacks.
- If a nonce-based policy becomes achievable (e.g. via middleware), it should
  replace `unsafe-inline` and add `'strict-dynamic'`.

**Code reference:** `next.config.ts:10–17`
