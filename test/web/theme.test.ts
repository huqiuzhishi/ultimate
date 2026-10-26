import { expect, it } from 'vitest'
import {
  applyAppearanceToDom,
  CODE_FONTS,
  getCodeFont,
  getThemePreset,
  getUiFont,
  preferredPresetForPolarity,
  readStoredAppearance,
  saveAppearance,
  STORAGE_KEYS,
  THEME_PRESETS,
  UI_FONTS,
} from '../../extensions/theme/presets.ts'

function createFakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value)
    },
  }
}

function createFakeDocument() {
  const classes = new Set<string>(['dark'])
  const styles = new Map<string, string>()
  let metaThemeColor = '#111112'
  let styleMutations = 0
  const documentElement = {
    dataset: {} as Record<string, string>,
    classList: {
      toggle(name: string, force?: boolean) {
        const next = force ?? !classes.has(name)
        if (next) classes.add(name)
        else classes.delete(name)
        return next
      },
      contains(name: string) {
        return classes.has(name)
      },
    },
    style: {
      setProperty(name: string, value: string) {
        styles.set(name, value)
        styleMutations++
      },
      getPropertyValue(name: string) {
        return styles.get(name) ?? ''
      },
    },
  }
  return {
    doc: {
      documentElement,
      querySelector(selector: string) {
        if (selector === 'meta[name=theme-color]') {
          return {
            setAttribute(attr: string, value: string) {
              if (attr === 'content') metaThemeColor = value
            },
          }
        }
        return null
      },
    } as unknown as Document,
    classes,
    styles,
    getMetaColor: () => metaThemeColor,
    getStyleMutations: () => styleMutations,
  }
}

it('defaults to Ultimate Dark, Inter, and JetBrains Mono when storage is empty', () => {
  const storage = createFakeStorage()
  expect(readStoredAppearance(storage)).toEqual({
    preset: 'ultimate-dark',
    uiFont: 'inter',
    codeFont: 'jetbrains-mono',
  })
  storage.setItem(STORAGE_KEYS.polarity, 'light')
  expect(readStoredAppearance(storage).preset).toBe('ultimate-light')
})

it('persists preset, polarity, last dark/light preset, and independent UI/code fonts', () => {
  const storage = createFakeStorage()
  saveAppearance({ preset: 'tokyo-night', uiFont: 'dm-sans', codeFont: 'firacode' }, storage)
  expect(storage.getItem(STORAGE_KEYS.preset)).toBe('tokyo-night')
  expect(storage.getItem(STORAGE_KEYS.polarity)).toBe('dark')
  expect(storage.getItem(STORAGE_KEYS.lastDark)).toBe('tokyo-night')
  expect(storage.getItem(STORAGE_KEYS.uiFont)).toBe('dm-sans')
  expect(storage.getItem(STORAGE_KEYS.codeFont)).toBe('firacode')

  saveAppearance({ preset: 'catppuccin-latte', uiFont: 'manrope', codeFont: 'hack' }, storage)
  expect(storage.getItem(STORAGE_KEYS.polarity)).toBe('light')
  expect(storage.getItem(STORAGE_KEYS.lastLight)).toBe('catppuccin-latte')
  expect(preferredPresetForPolarity('dark', storage)).toBe('tokyo-night')
  expect(preferredPresetForPolarity('light', storage)).toBe('catppuccin-latte')

  // External polarity flip resolves back to the user's last dark preset
  expect(readStoredAppearance(storage, 'dark')).toEqual({
    preset: 'tokyo-night',
    uiFont: 'manrope',
    codeFont: 'hack',
  })
})

it('applies data-theme, .dark class, meta theme-color, and independent --font-sans / --font-mono to DOM', () => {
  const { doc, classes, styles, getMetaColor, getStyleMutations } = createFakeDocument()

  applyAppearanceToDom({ preset: 'rose', uiFont: 'dm-sans', codeFont: 'mononoki' }, doc)
  expect(doc.documentElement.dataset.theme).toBe('rose')
  expect(classes.has('dark')).toBe(true)
  expect(getMetaColor()).toBe(getThemePreset('rose').themeColor)
  expect(styles.get('--theme-preset')).toBe('rose')
  expect(styles.get('--font-sans')).toBe(getUiFont('dm-sans').css)
  expect(styles.get('--font-mono')).toBe(getCodeFont('mononoki').css)

  const before = getStyleMutations()
  // Switching between two dark themes still mutates documentElement.style so terminal's MutationObserver fires
  applyAppearanceToDom({ preset: 'dracula', uiFont: 'dm-sans', codeFont: 'mononoki' }, doc)
  expect(doc.documentElement.dataset.theme).toBe('dracula')
  expect(classes.has('dark')).toBe(true)
  expect(styles.get('--theme-preset')).toBe('dracula')
  expect(getStyleMutations()).toBeGreaterThan(before)

  applyAppearanceToDom(
    { preset: 'solarized-light', uiFont: 'system', codeFont: 'ibm-plex-mono' },
    doc,
  )
  expect(doc.documentElement.dataset.theme).toBe('solarized-light')
  expect(classes.has('dark')).toBe(false)
  expect(getMetaColor()).toBe('#fdf6e3')
  expect(styles.get('--font-sans')).toBe(getUiFont('system').css)
  expect(styles.get('--font-mono')).toBe(getCodeFont('ibm-plex-mono').css)
})

it('covers all 17 theme presets and font stacks with valid fallback chains', () => {
  expect(THEME_PRESETS.length).toBe(17)
  expect(
    UI_FONTS.every((font) => font.css.includes('sans-serif') || font.css.includes('monospace')),
  ).toBe(true)
  expect(CODE_FONTS.every((font) => font.css.includes('monospace'))).toBe(true)
})
