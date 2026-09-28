# ADR-007: Whether the app should be installable (open)

**Date:** 2026-09-24
**Status:** Open (not yet decided)
**Deciders:** Pending

## Context

The app could be made installable as a Progressive Web App (PWA), giving
members a native-like experience on mobile and desktop. This would require a
service worker, a web app manifest, and offline caching strategy.

## Decision

**Not yet decided.** This ADR is a placeholder to track the open question.

## Consequences

To be determined. Key considerations:
- PWA installability requires offline support, which conflicts with the app's
  reliance on live contract reads and backend API calls.
- The Freighter wallet extension may not work reliably in a PWA context.
- Service worker caching could serve stale contract data.

**Tracking:** Open issue in the repository.
