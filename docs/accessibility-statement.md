# Accessibility statement

**Target:** WCAG 2.2 Level AA
**Statement date:** 2026-09-27
**Applies to:** `ourdao-frontend` on `main`
**Status:** Conformance target declared; conformance **not yet claimed**. Known
gaps are listed below and tracked as issues.

## The target

This app aims to meet **WCAG 2.2 Level AA**. That target is now stated in the
[README](../README.md#accessibility) so there is something to measure individual
work against.

Stating a target is not the same as meeting it, so this document does **not**
claim conformance. What it does is record, per success criterion, what has
actually been verified — pass, fail, or untested — and link every known failure
to its issue. Untested means "nobody has checked", not "probably fine".

## How to read the audit

| Status | Meaning |
| --- | --- |
| **Pass** | Verified, with the evidence named in the row. |
| **Partial** | The mechanism exists and was verified on some surfaces, not all of them. |
| **Fail** | Known not to be met. Linked to the issue that tracks it. |
| **Untested** | No evidence either way. This is the coverage gap, and it is the largest category. |
| **N/A** | Does not apply to this app. |

Scope of the automated coverage behind this table:

- `eslint-plugin-jsx-a11y` (recommended ruleset) runs on every file via
  `npm run lint --max-warnings=0`.
- `axe-core` runs in `test/a11y.test.tsx` against the real rendered output of
  `AppShell`, `ConnectButton` and the loan-request form, failing on any
  violation at any impact level. No `axe` rule is disabled anywhere.
- Direct role/name assertions cover what `axe` cannot: the skip-link target
  exists, the drawer dialog has an accessible name once opened, the
  notification bell has an accessible name, form inputs are labelled, banners
  use `role="alert"`.
- `test/contrast.test.ts` checks ten core foreground/background token pairs
  against AA in both themes.
- `test/AppShell-drawer.test.tsx` covers the drawer's focus trap, Escape
  handling and focus restoration.

The surface area those cover is a fraction of the app — five components, not
every route. That is why so much of the table below is **Untested**, and why
#375 (automated checks across the app) stays open even though the harness from
##238 exists.

## Audit

WCAG 2.2 defines 86 success criteria; 55 of them are Level A or AA, and those
are the ones a Level AA claim depends on. All 55 are listed.

### 1. Perceivable

| Criterion | Level | Status | Evidence or issue |
| --- | --- | --- | --- |
| 1.1.1 Non-text Content | A | Partial | Icon-only controls on the audited surfaces have accessible names (#231, asserted in `test/a11y.test.tsx`). Not audited app-wide. |
| 1.2.1 Audio-only / Video-only | A | N/A | No audio or video content. |
| 1.2.2 Captions (Prerecorded) | A | N/A | No prerecorded media. |
| 1.2.3 Media Alternative | A | N/A | No prerecorded media. |
| 1.2.4 Captions (Live) | AA | N/A | No live media. |
| 1.2.5 Audio Description | AA | N/A | No media. |
| 1.3.1 Info and Relationships | A | **Fail** | Form controls do not all have a programmatic label association — [#360](https://github.com/ourdao/ourdao-frontend/issues/360). |
| 1.3.2 Meaningful Sequence | A | Untested | No automated check; relies on not reordering DOM for visual reasons. |
| 1.3.3 Sensory Characteristics | A | Untested | No automated check. |
| 1.3.4 Orientation | AA | **Fail** | The web manifest locks the app to portrait — [#353](https://github.com/ourdao/ourdao-frontend/issues/353). |
| 1.3.5 Identify Input Purpose | AA | Untested | No check that address/identity fields carry the right `autocomplete` tokens. |
| 1.4.1 Use of Color | A | Partial | Status is conveyed by icon and text as well as colour (`StatusBadge`, `MEMBER_STATUS_LABELS`); not audited on every status surface. |
| 1.4.2 Audio Control | A | N/A | Nothing autoplays audio. |
| 1.4.3 Contrast (Minimum) | AA | Partial | Ten core token pairs verified in both themes (`test/contrast.test.ts`, #234). Not every rendered pair is covered. |
| 1.4.4 Resize Text | AA | **Fail** | The viewport disables pinch-zoom — [#321](https://github.com/ourdao/ourdao-frontend/issues/321). |
| 1.4.5 Images of Text | AA | Pass | No images of text; all text is live text. |
| 1.4.10 Reflow | AA | Untested | No 320 CSS px viewport test. |
| 1.4.11 Non-text Contrast | AA | Untested | Focus rings and control borders are not contrast-checked. |
| 1.4.12 Text Spacing | AA | Untested | No text-spacing override test. |
| 1.4.13 Content on Hover or Focus | AA | Untested | Tooltips and popovers are not checked for dismissability. |

### 2. Operable

| Criterion | Level | Status | Evidence or issue |
| --- | --- | --- | --- |
| 2.1.1 Keyboard | A | Partial | The drawer traps and restores focus correctly (#68, `test/AppShell-drawer.test.tsx`); other components are unaudited. |
| 2.1.2 No Keyboard Trap | A | Partial | As above — verified for the drawer only. |
| 2.1.4 Character Key Shortcuts | A | Pass | No single-character shortcuts are bound. |
| 2.2.1 Timing Adjustable | A | Pass | No time limits. Countdown displays are informational. |
| 2.2.2 Pause, Stop, Hide | A | Pass | Nothing auto-animates for more than five seconds. |
| 2.3.1 Three Flashes | A | N/A | No flashing content. |
| 2.4.1 Bypass Blocks | A | Pass | Skip-to-main link targeting `<main id="main-content">`, asserted by role and name (#232). |
| 2.4.2 Page Titled | A | **Fail** | Every route shares one tab title — [#352](https://github.com/ourdao/ourdao-frontend/issues/352). |
| 2.4.3 Focus Order | A | Untested | No assertion that DOM order matches visual order. |
| 2.4.4 Link Purpose (In Context) | A | Untested | No automated check of link text. |
| 2.4.5 Multiple Ways | AA | Pass | Every page is reachable from the persistent sidebar, plus in-app navigation. |
| 2.4.6 Headings and Labels | AA | Partial | `PageHeader` gives each page a heading; labels are subject to [#360](https://github.com/ourdao/ourdao-frontend/issues/360). |
| 2.4.7 Focus Visible | AA | Untested | No automated check that a visible focus indicator exists. |
| 2.4.11 Focus Not Obscured (Minimum) | AA | Untested | Sticky header/sidebar overlap is not tested. New in 2.2. |
| 2.5.1 Pointer Gestures | A | Pass | No path or multipoint gestures. |
| 2.5.2 Pointer Cancellation | A | Pass | Actions fire on activation, not on down. |
| 2.5.3 Label in Name | A | Untested | Not checked against accessible names. |
| 2.5.4 Motion Actuation | A | Pass | No device-motion input. |
| 2.5.7 Dragging Movements | AA | Untested | No drag interactions found, but this is unverified. New in 2.2. |
| 2.5.8 Target Size (Minimum) | AA | Untested | No 24×24 CSS px assertion. New in 2.2. |

### 3. Understandable

| Criterion | Level | Status | Evidence or issue |
| --- | --- | --- | --- |
| 3.1.1 Language of Page | A | Partial | `lang` is set in the root layout; not asserted. |
| 3.1.2 Language of Parts | AA | N/A | No passages in a second language. |
| 3.2.1 On Focus | A | Pass | No focus handler changes context. |
| 3.2.2 On Input | A | Pass | No `onChange` handler navigates. |
| 3.2.3 Consistent Navigation | AA | Pass | `AppShell` renders one sidebar for every route in the group. |
| 3.2.4 Consistent Identification | AA | Partial | Same components across routes; duplicated status maps are tracked in [#358](https://github.com/ourdao/ourdao-frontend/issues/358). |
| 3.2.6 Consistent Help | A | N/A | No help mechanism to keep consistent. New in 2.2. |
| 3.3.1 Error Identification | A | Pass | `FormErrorSummary` uses `role="alert"`; inline errors are text. |
| 3.3.2 Labels or Instructions | A | **Fail** | Partly — see [#360](https://github.com/ourdao/ourdao-frontend/issues/360). |
| 3.3.3 Error Suggestion | AA | Partial | Field errors suggest corrections; not asserted per field. |
| 3.3.4 Error Prevention (Financial/Data) | AA | Pass | Writes are submitted through Freighter for explicit approval, and are individually reversible actions rather than a single submission. |
| 3.3.7 Redundant Entry | A | Untested | No check that previously entered information is auto-populated. New in 2.2. |
| 3.3.8 Accessible Authentication (Minimum) | AA | Untested | Wallet connect is extension-mediated; not audited. New in 2.2. |

### 4. Robust

| Criterion | Level | Status | Evidence or issue |
| --- | --- | --- | --- |
| 4.1.2 Name, Role, Value | A | Partial | `axe` plus direct role/name assertions on the audited surfaces (#238, #231). Not audited app-wide, and subject to [#360](https://github.com/ourdao/ourdao-frontend/issues/360). |
| 4.1.3 Status Messages | AA | Partial | `role="alert"` on mismatch and version banners and on `FormErrorSummary`; `react-hot-toast` renders toasts with `role="status"` and `aria-live="polite"`. Not verified with a screen reader. |

## Summary

| Status | Count |
| --- | --- |
| Pass | 14 |
| Partial | 11 |
| Fail | 5 |
| Untested | 16 |
| N/A | 9 |
| **Total (Level A + AA)** | **55** |

Fourteen of 55 verified, five known failures, and 16 criteria with no evidence
at all. The honest summary is that the target is declared, the harness exists,
and the audit has not been run broadly enough to support a conformance claim.

## Known gaps

Every known failure, with the criterion it fails:

| Issue | Criterion | Gap |
| --- | --- | --- |
| [#353](https://github.com/ourdao/ourdao-frontend/issues/353) | 1.3.4 Orientation | Web manifest locks the app to portrait. |
| [#321](https://github.com/ourdao/ourdao-frontend/issues/321) | 1.4.4 Resize Text | Viewport disables pinch-zoom. |
| [#352](https://github.com/ourdao/ourdao-frontend/issues/352) | 2.4.2 Page Titled | One tab title for every route. |
| [#360](https://github.com/ourdao/ourdao-frontend/issues/360) | 1.3.1, 3.3.2, 4.1.2 | Shared form components with correct label association. |
| [#375](https://github.com/ourdao/ourdao-frontend/issues/375) | several | Automated checks do not yet cover the whole app. The harness from #238 exists; coverage is the remaining work. |

Fixing these gaps is deliberately out of scope for the issue that created this
statement — each is tracked on its own.

## Enforcement

The target is only worth stating if something checks it. Four mechanisms run in
CI today:

1. **`eslint-plugin-jsx-a11y`**, recommended ruleset, on every source file, via
   `npm run lint --max-warnings=0`. Static rules catch missing roles, names and
   handlers at diff time. They cannot judge contrast, focus order or whether a
   name makes sense.
2. **`axe-core` in `test/a11y.test.tsx`**, against rendered output rather than
   source. Fails on any violation at any impact level, with no rule disabled and
   no baseline snapshot to update — a new violation is a failing test
   immediately.
3. **Direct role and name assertions** for what `axe` cannot express: skip-link
   target, dialog naming, icon-button names, labelled inputs, `role="alert"`
   banners.
4. **`test/contrast.test.ts`**, ten core token pairs against AA in both themes.

What none of this does is audit every route, and that is the gap
[#375](https://github.com/ourdao/ourdao-frontend/issues/375) covers. Until the
automated surface reaches the whole app, treat the **Untested** rows above as
unknown rather than as passes.

## Maintaining this document

- Adding an issue for a WCAG failure? Add a row to **Known gaps** and set that
  criterion to **Fail**. That is what makes priority follow from the target.
- Widening the automated coverage? Promote the affected rows from **Untested**
  to **Partial** or **Pass** and name the test that now covers them.
- Re-run the audit when any of the above changes, and update the statement date
  and counts.

Related: [`docs/a11y-audit.md`](./a11y-audit.md) is the component-level triage
from #238, which this document builds on.
