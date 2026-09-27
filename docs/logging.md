# Client-side logging (#267)

Every log call in `src/lib/` and `src/hooks/` used to go straight to `console`.
That left three things undecided: no level control, no production default, and
no rule about what may be written. `src/lib/logger.ts` settles all three.

## Using it

```ts
import { logger } from '@/lib/logger'

logger.debug('readAddress branch: object_address')
logger.warn('Notification permission request failed', { err })
```

`logger.error` / `warn` / `info` / `debug`, each taking a message and an
optional context object. The context is scrubbed before it is written.

This is the only module in `src/lib/` and `src/hooks/` allowed to touch
`console`. A test in `src/lib/logger.test.ts` walks both directories and fails
if a direct `console.*` call appears, so the convention cannot quietly lapse.

## Levels

`silent` < `error` < `warn` < `info` < `debug`.

| Environment | Default |
| --- | --- |
| production (`NODE_ENV=production`) | `silent` — nothing is written |
| anywhere else | `debug` |

Production being silent is the point: a member's browser console is not the
place for this app's diagnostics unless someone has deliberately asked for
them. To turn it up:

- `NEXT_PUBLIC_LOG_LEVEL=info` sets the default at build time, or
- `setLogLevel('debug')` changes it at runtime, and `setLogLevel(null)` puts
  the default back.

`isLevelEnabled('debug')` lets a hot path skip building an expensive message
it would only throw away.

## What may never be logged

The browser console is user-visible and user-shareable. A member pasting
console output into a bug report should not be pasting anything sensitive.

**Never, at any level:**

- **Signed transaction XDRs.** Replayable, and the wallet boundary should not
  be producing them into a log at all.
- **Document passwords and passphrases.**
- **Decrypted or plaintext document content**, and anything derived from it.
- **Mnemonics, seed phrases and private keys.** The last two are already
  impossible — the frontend never holds a key — but the rule is stated so
  nobody has to re-derive that.

These are enforced by key rather than by convention: `scrub` replaces the
value with `[redacted]` when a context key contains `password`, `passphrase`,
`secret`, `mnemonic`, `seed`, `privatekey`, `xdr`, `signedxdr`, `decrypted` or
`plaintext` (case- and separator-insensitive, so `signedXdr`, `signed_xdr` and
`SIGNED-XDR` are all covered). `logger.warn('x', { password })` cannot leak
even by accident.

## Addresses: truncated, not dropped

A Stellar address is the member's identity in this system, so it is treated as
sensitive — but unlike an XDR it is not a credential, and correlating it with
local debugging is often the point.

`ourdao-backend#133` closed with exactly that position: an address is
acceptable at `debug` provided it is truncated the way the frontend renders
one. So the logger truncates any Stellar address it sees to `GABCD…WXYZ`:

- in free text, including inside a template literal
- in any string anywhere in the context object
- in `Error.message` and `Error.stack`

This is automatic, so a call site that logs a full address still cannot leak
it — the truncation happens at the last point before the write. `formatAddress`
is exported for the cases that want a readable address deliberately.

## How this differs from error reporting

`docs/error-reporting.md` covers `src/lib/error-reporting.ts`, and the two
intentionally disagree about addresses. Error reporting *removes* them
(`[redacted-address]`) because a report is written to be pasted into a public
bug tracker. Logging truncates them, because a log line stays on the member's
own machine where the surrounding context is the point.

`error-reporting.ts` also keeps its direct `console.error`. That call is the
opt-in reporting *sink*, not a log line: routing it through the logger would
silence a report the member explicitly agreed to send, since production
defaults to `silent`. It is the one documented exemption in the
no-bare-console test.

## Backend alignment

`ourdao-backend` uses Pino and applies `LOG_LEVEL`. The same policy applies on
both sides: addresses truncated, credentials never. Backend issue #133 also
asked for addresses to be truncated "as the frontend's `formatAddress` does" —
that helper did not exist when the issue closed, and this change adds it. The
backend can now import the same convention.
