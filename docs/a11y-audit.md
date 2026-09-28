# Accessibility audit — interactive surfaces (issue #238)

**Date:** 2026-09-26
**Scope:** `AppShell`, mobile drawer (`Sheet`), `NotificationCenter` popover,
`ConnectButton`, `NetworkBadge`, loan request form, dialogs.
**Method:** `axe-core` run in `test/a11y.test.tsx` plus direct role /
accessible-name assertions in the tests that already render these components.
`eslint-plugin-jsx-a11y` (recommended ruleset) already runs in CI via
`npm run lint --max-warnings=0`.

## Violations found and disposition

| # | Surface | Violation | Disposition |
|---|---------|-----------|-------------|
| 1 | `NotificationCenter` bell trigger (`PopoverTrigger`) | Icon-only `<button>` had `title="Notifications"` but no `aria-label` — fails `button-name` for AT that ignores `title` | **Fixed:** `aria-label="Open notifications"` added; asserted in `test/a11y.test.tsx` |
| 2 | `NotificationCenter` duplicate bell inside `PopoverContent` | Same `title`-only pattern, plus a second bell inside the open panel is confusing | **Fixed:** `aria-label="Toggle notifications"` added; panel structure left intact to avoid a visual refactor in this PR |
| 3 | `NotificationCenter` per-notification remove button | Icon-only `<button title="Remove">` with no programmatic name | **Fixed:** `aria-label="Remove notification"` added |
| 4 | `AppShell` | No skip link; `<main>` had no `id` — keyboard / SR users must tab through the full header and sidebar on every page | **Fixed:** `Skip to main content` link (visually hidden until focused) targeting `<main id="main-content">`; asserted by role/name |
| 5 | Mobile drawer (`SheetContent`) | Already had `role="dialog"` + `SheetTitle="Navigation menu"` (issue #68); verified no regression | **Kept:** `dialog` role + accessible name asserted; focus trap / Escape / restoration already covered in `test/AppShell-drawer.test.tsx` |
| 6 | Mismatch + version banners (`WalletProvider`) | `role="alert"` present; verified they stay announced | **Kept:** asserted in `test/a11y.test.tsx` via the mismatch banner test in `test/network-mismatch.test.tsx` |

Suppression policy: no `axe` rule is disabled without a reason in code.
The helper `test/a11y.ts` documents each `disabledRules` entry inline when
used; currently no rule is disabled — the suite fails on any new violation.

## What the suite now enforces

- `test/a11y.test.tsx` runs `axe-core` on `AppShell` (header + nav + skip
  link), `ConnectButton`, and the loan-request form step 1, and fails on any
  `violation` (impact `critical`, `serious`, `moderate`, or `minor`).
- Direct assertions cover what `axe` cannot: skip-link target exists, dialog
  has an accessible name once opened, notification bell has an accessible
  name, form inputs are labelled, banners use `role="alert"`.
- A new violation fails the suite by design — no baseline snapshot to update.

## Follow-ups (out of scope, tracked separately)

- Individual a11y issues (contrast verification, live regions for toasts,
  focus management in multi-step forms) remain in their own issues; this PR
  adds the harness, not every fix.
- The duplicate bell inside `PopoverContent` should be removed in a follow-up
  visual pass once the panel layout is re-specced.

**Code references:** `src/components/AppShell.tsx`,
`src/components/NotificationCenter.tsx`, `test/a11y.test.tsx`,
`test/a11y.ts`.
