# Design Tokens Reference

## Overview

OurDAO Frontend uses Tailwind CSS v4 `@theme` tokens defined in `src/app/globals.css`. These tokens generate utility classes (e.g., `--color-primary-600` → `bg-primary-600` / `text-primary-600`).

**Rule**: Raw Tailwind colour utilities (e.g., `text-gray-500`, `bg-blue-500`) are not used. All colour decisions come from these semantic tokens.

## Brand Colours

Primary indigo palette used for accents, links, and interactive elements:

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `primary-50` | `#eef2ff` | `#eef2ff` | Lightest tint |
| `primary-100` | `#e0e7ff` | `#e0e7ff` | Light tint |
| `primary-200` | `#c7d2fe` | `#c7d2fe` | Selection highlight (light) |
| `primary-300` | `#a5b4fc` | `#a5b4fc` | Hover states |
| `primary-400` | `#818cf8` | `#818cf8` | Interactive elements |
| `primary-500` | `#6366f1` | `#6366f1` | Focus rings, primary actions |
| `primary-600` | `#4f46e5` | `#4f46e5` | Primary buttons (light mode) |
| `primary-700` | `#4338ca` | `#4338ca` | Active states |
| `primary-800` | `#3730a3` | `#3730a3` | Selection highlight (dark) |
| `primary-900` | `#312e81` | `#312e81` | Text on light selection |
| `primary-950` | `#1e1b4b` | `#1e1b4b` | Darkest shade |

## Semantic Tokens

### Background & Foreground

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `background` | `#ffffff` | `#0a0e17` | Page background |
| `foreground` | `#111827` | `#f3f4f6` | Primary text |

### Card & Popover

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `card` | `#ffffff` | `#111827` | Card backgrounds |
| `card-foreground` | `#111827` | `#f3f4f6` | Card text |
| `popover` | `#ffffff` | `#111827` | Dropdown/modal backgrounds |
| `popover-foreground` | `#111827` | `#f3f4f6` | Dropdown/modal text |

### Primary

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `primary` | `#4f46e5` | `#6366f1` | Primary buttons, links |
| `primary-foreground` | `#ffffff` | `#ffffff` | Text on primary backgrounds |

### Secondary & Muted

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `secondary` | `#f3f4f6` | `#1f2937` | Secondary buttons, subtle backgrounds |
| `secondary-foreground` | `#111827` | `#f3f4f6` | Text on secondary |
| `muted` | `#f3f4f6` | `#1f2937` | Muted backgrounds, disabled states |
| `muted-foreground` | `#6b7280` | `#9ca3af` | Placeholder text, labels |

### Accent

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `accent` | `#f3f4f6` | `#1f2937` | Hover backgrounds |
| `accent-foreground` | `#111827` | `#f3f4f6` | Text on accent |

### Status Colours

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `destructive` | `#dc2626` | `#ef4444` | Error states, delete actions |
| `destructive-foreground` | `#ffffff` | `#ffffff` | Text on destructive |
| `success` | `#10b981` | `#10b981` | Success states, confirmations |
| `success-foreground` | `#ffffff` | `#ffffff` | Text on success |

### Borders & Inputs

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `border` | `#e5e7eb` | `#1f2937` | Default borders |
| `input` | `#d1d5db` | `#374151` | Input field borders |
| `ring` | `#6366f1` | `#818cf8` | Focus ring colour |

## Intended Token Pairings

| Background Token | Foreground Token | Usage |
|------------------|------------------|-------|
| `background` | `foreground` | Page content |
| `card` | `card-foreground` | Card components |
| `popover` | `popover-foreground` | Dropdowns, modals |
| `primary` | `primary-foreground` | Primary buttons |
| `secondary` | `secondary-foreground` | Secondary buttons |
| `muted` | `muted-foreground` | Labels, placeholders |
| `accent` | `accent-foreground` | Hover states |
| `destructive` | `destructive-foreground` | Error/delete actions |
| `success` | `success-foreground` | Success confirmations |

## Status Colours (Semantic Meaning)

| Token | Meaning | Usage |
|-------|---------|-------|
| `destructive` | Danger, error, irreversible action | Delete buttons, error messages, validation errors |
| `success` | Success, completion, positive outcome | Confirmation messages, completed states |
| `ring` | Focus, active element | Keyboard focus rings, active form fields |

## Dark Mode

Dark mode tokens are defined in `.dark` CSS class overrides in `src/app/globals.css`. They flip the semantic set while keeping the same token names:

```css
.dark {
  --color-background: #0a0e17;
  --color-foreground: #f3f4f6;
  /* ... */
}
```

The `.dark` class is toggled by `next-themes` based on system preference or manual selection.

## Adding New Tokens

1. Add the CSS custom property in `src/app/globals.css` under `@theme`
2. Add the dark mode override under `.dark`
3. Document the token in this file with its purpose and intended pairing
4. Use only semantic tokens in components — no raw Tailwind colour utilities
