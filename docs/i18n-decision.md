# i18n decision (#248)

## What changed

`formatDate` in `src/lib/utils.ts` hardcoded `toLocaleDateString('en-US', …)`,
so every member saw US month/day ordering (e.g. "Mar 4, 2026") regardless of
their own browser locale. This was a bug, not a design choice, and it's now
fixed: `formatDate` reads `navigator.language` when it's available (client
side) and otherwise passes `undefined` to `toLocaleDateString`, which falls
back to the JS runtime's own default locale. Date *formatting* now follows
the user's locale.

## What did not change (deliberately, for now)

**Full internationalization — translating the UI's copy into other
languages — is out of scope for this change and is not being adopted as a
goal right now.** All UI strings (labels, button text, error messages,
toasts) remain hardcoded English. This is a legitimate, documented outcome
rather than a rejected requirement: this is a small team building a Soroban
lending DAO frontend, and standing up a translation pipeline (string
extraction, a translation management workflow, locale-aware pluralization,
review of translated copy) is a substantial, ongoing commitment that hasn't
been prioritized. Fixing the date-formatting bug does not imply that
commitment has been made.

If/when full i18n is adopted, that should be its own tracked issue with its
own design (library choice — e.g. `next-intl` — string extraction strategy,
translation ownership).

## RTL layout

No right-to-left layout support is needed while the app is English-only.
This should be revisited if/when a right-to-left locale (e.g. Arabic,
Hebrew) is added as part of a future full-i18n effort — Tailwind's logical
properties (`ms-*`/`me-*` instead of `ml-*`/`mr-*`, etc.) would need an
audit at that point. Not addressed here since it isn't yet needed.

## `formatToken` and `Intl.NumberFormat`

Also raised by #248: `formatToken` (same file) does its own string-based
formatting rather than using `Intl.NumberFormat`. This was assessed and
intentionally left as-is — see the comment directly above `formatToken` in
`src/lib/utils.ts` for the reasoning: `Intl.NumberFormat` operates on JS
`number`, which loses precision for large stroop-denominated amounts, so
swapping it in would reintroduce float-precision bugs `formatToken` was
specifically written to avoid (it uses BigInt division for that reason).
Grouping/thousands-separators are left off rather than adding a
number-based formatting pass on top of already-computed BigInt strings just
for cosmetic grouping.
