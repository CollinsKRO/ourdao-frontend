import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const PUBLIC_DIR = resolve(import.meta.dirname, '../../public')

describe('PWA Manifest', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(PUBLIC_DIR, 'manifest.json'), 'utf-8')
  )

  it('has required PWA fields', () => {
    expect(manifest.name).toBeDefined()
    expect(manifest.short_name).toBeDefined()
    expect(manifest.start_url).toBeDefined()
    expect(manifest.display).toBeDefined()
    expect(manifest.icons).toBeDefined()
    expect(Array.isArray(manifest.icons)).toBe(true)
  })

  it('all referenced icon files exist', () => {
    for (const icon of manifest.icons) {
      const iconPath = resolve(PUBLIC_DIR, icon.src)
      expect(existsSync(iconPath)).toBe(true)
    }
  })

  it('all shortcut icons exist', () => {
    if (manifest.shortcuts) {
      for (const shortcut of manifest.shortcuts) {
        if (shortcut.icons) {
          for (const icon of shortcut.icons) {
            const iconPath = resolve(PUBLIC_DIR, icon.src)
            expect(existsSync(iconPath)).toBe(true)
          }
        }
      }
    }
  })

  it('has valid icon purposes', () => {
    const validPurposes = ['any', 'maskable', 'monochrome']
    for (const icon of manifest.icons) {
      if (icon.purpose) {
        expect(validPurposes).toContain(icon.purpose)
      }
    }
  })
})

describe('Service Worker', () => {
  it('sw.js exists in public directory', () => {
    const swPath = resolve(PUBLIC_DIR, 'sw.js')
    expect(existsSync(swPath)).toBe(true)
  })
})
