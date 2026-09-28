# User-facing messages

Everything the app says to a member — toasts, banners, field errors, empty
states, wallet gates — comes from one catalogue: [`src/lib/messages.ts`](../src/lib/messages.ts).
`test/messages.test.ts` fails if a message is re-introduced as an inline
literal, so add copy there, not at the call site.

## House style

1. **Sentence case.** Messages start with a capital letter. Headings that
   already use title case (`Wallet Not Connected`, `Connect Your Wallet`) keep
   that form.
2. **One condition → one message.** Each key describes exactly one situation.
   If two call sites hit the same condition, they share one key — never two
   near-identical strings. Don't stack two problems into one string either;
   report the first one and let the user fix it.
3. **Full sentences end in punctuation** (`.`, `!`, or `…` for a loading
   toast). Short fragments — action labels (`Registering membership`),
   headings, and status toasts (`Wallet connected`) — stay unpunctuated, as
   they always have been.
4. **Say the action when there is one.** "…You can try again." beats a bare
   failure. The word should tell the member what to do next, not what the code
   did.
5. **No jargon.** No error codes, HTTP statuses, stack traces, env var names,
   or internal identifiers in the copy itself. (Contract revert codes are the
   exception by design — they're translated by `contract-errors.ts`, and their
   catalogue is written in the same human-readable style.)
6. **Templates take arguments.** Anything dynamic is a parameter of a template
   function (`loanAmountExceedsMax(max)`), so call sites never interpolate
   copy themselves and copy changes stay in one file.

### What deliberately stays outside the catalogue

- **`src/app/api/documents/route.ts` response strings.** Those are the API's
  contract (asserted by `test/documents-route.test.ts`), not UI copy. When the
  UI shows one, it goes through `presentBackendError` (below).
- **`src/lib/contract-errors.ts`.** Contract error codes are append-only and
  synced with `ourdao-contracts`; same pattern, separate file.
- **Degradation/config notices** such as the `No contract configured` banner
  in `AppShell` — they describe the deployment, not a member action, and are
  pinned by tests as-is.
- **Developer-only errors** (e.g. `useWallet must be used within a
  WalletProvider`) are never shown in the UI and stay inline where they're
  thrown.

## Backend `{ error, correlationId }` payloads

The backend and the document route can fail with a JSON body shaped like
`{ error, correlationId }`. The presentation policy is implemented by
`presentBackendError(payload, fallback)` in `src/lib/messages.ts`:

- The user sees the backend's `error` sentence when it has one — it's already
  written for a human. Otherwise they see `fallback`, which call sites pull
  from `MESSAGES` (e.g. `Document upload failed (<status>)`).
- The `correlationId` **never** reaches the UI. It's written to the console
  (`[backend-error] <id>`) so support can match a member's screenshot to a
  server log.
- Raw payloads are never spliced into a toast: a non-string, empty, or absent
  `error` falls back to the catalogue message. No `[object Object]`, no
  half-parsed JSON in a toast.

Example (`src/lib/ipfs.ts`):

```ts
const body = (await res.json().catch(() => null)) as { error?: string } | null
throw new Error(presentBackendError(body, MESSAGES.documents.uploadRejected(res.status)))
```

## Coordination

This catalogue is the centralization that the error-summary and i18n work
depends on: an error summary can render `MESSAGES.*` values directly, and a
future translation layer only needs to key off `src/lib/messages.ts`. Actual
translation is out of scope here.

## Adding a message

1. Add the key to the right group in `src/lib/messages.ts` (template
   functions take every dynamic value as an argument).
2. Use it at the call site: `toast.error(MESSAGES.validation.theNewThing)`.
3. Run `npm test` — `test/messages.test.ts` checks style, uniqueness, and that
   the string appears only in the catalogue.
