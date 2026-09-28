# Client-side error reporting (#247)

Before this, an uncaught render error or a failed background query only
ever hit `console.error` in whatever browser tab it happened in — nobody
was notified. `src/lib/error-reporting.ts` gives every catch site in the app
one place to report through.

## What's captured

- The route-level error boundary (`src/app/error.tsx`)
- The root error boundary (`src/app/global-error.tsx`)
- TanStack Query's central `onError` (`createQueryClient()` in
  `src/components/providers.tsx`) — every failed query, not just ones a
  screen chooses to handle

Each report includes the (scrubbed) error message and stack, an optional
correlation id, free-form context about where it happened (e.g. the failing
query's key), and a timestamp.

## Opt-in

OurDAO is a member-facing wallet app, so nothing is reported unless the
member has explicitly opted in. The preference is a `localStorage` flag,
`ourdao:error-reporting-opt-in` (`'true'`/`'false'`, default off/absent).
`isErrorReportingOptedIn()` / `setErrorReportingOptIn()` read and write it.
There is currently no UI control wired up to let a member flip this
preference from settings — that's a follow-up; the mechanism opting-out by
default is what makes it safe to leave unwired for now (opted out is a
true no-op, not "not yet implemented").

## What's scrubbed

Any Stellar public key (`G` + 55 base32 characters) found in the error
message, stack, or anywhere in the passed context is replaced with
`[redacted-address]` before anything is sent — a wallet address is
member-identifying in this app, so it's stripped regardless of opt-in
status logic elsewhere (scrubbing runs on every report that is sent).

## Correlation id

If the context passed to `reportError` carries an `x-correlation-id`
(directly, or via a `headers` value from a failed backend `fetch`
`Response`), it's extracted into its own `correlationId` field so a report
can be matched to a backend log line. **Current limitation:** `src/lib/backend.ts`'s
fetch helpers (`get`/`patch`) currently swallow the response on a non-ok
status rather than surfacing its headers on the error/fallback value, so a
correlation id isn't yet reliably available at the `onError` call site in
`providers.tsx`. Wiring that through is a follow-up to `backend.ts`, not
addressed by this change.

## Sink

No third-party error-reporting provider (Sentry, etc.) is configured or
approved yet, so `reportError` logs a structured, scrubbed payload via
`console.error` for now. This is provider-agnostic by design: swap the
`sendReport()` function in `src/lib/error-reporting.ts` for a real
provider's SDK call (e.g. `Sentry.captureException`) once one is chosen —
everything else (opt-in check, scrubbing, correlation id extraction) stays
the same.
