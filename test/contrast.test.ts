import { describe, it } from 'vitest'
import { expectWcagAAContrast } from './a11y'

describe('WCAG AA colour contrast', () => {
  it('keeps core text/background token pairs above AA contrast in both themes', () => {
    const pairs = [
      ['#111827', '#ffffff'],
      ['#374151', '#ffffff'],
      ['#f9fafb', '#111827'],
      ['#d1d5db', '#111827'],
      ['#1d4ed8', '#eff6ff'],
      ['#93c5fd', '#172554'],
      ['#166534', '#f0fdf4'],
      ['#86efac', '#14532d'],
      ['#92400e', '#fffbeb'],
      ['#fcd34d', '#451a03'],
    ] as const

    for (const [foreground, background] of pairs) {
      expectWcagAAContrast(foreground, background)
    }
  })
})
