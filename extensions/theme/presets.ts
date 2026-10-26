export type Polarity = 'dark' | 'light'

export interface ThemePreset {
  id: string
  label: string
  polarity: Polarity
  themeColor: string
}

export const THEME_PRESETS = [
  { id: 'ultimate-dark', label: 'Ultimate Dark', polarity: 'dark', themeColor: '#111112' },
  { id: 'cursor-dark', label: 'Cursor Dark', polarity: 'dark', themeColor: '#141414' },
  { id: 'rose', label: 'Rose', polarity: 'dark', themeColor: '#161011' },
  { id: 'catppuccin-mocha', label: 'Catppuccin Mocha', polarity: 'dark', themeColor: '#1e1e2e' },
  { id: 'gruvbox', label: 'Gruvbox Dark', polarity: 'dark', themeColor: '#282828' },
  { id: 'dracula', label: 'Dracula', polarity: 'dark', themeColor: '#282a36' },
  { id: 'tokyo-night', label: 'Tokyo Night', polarity: 'dark', themeColor: '#1a1b26' },
  { id: 'nord', label: 'Nord', polarity: 'dark', themeColor: '#2e3440' },
  { id: 'one-dark', label: 'One Dark', polarity: 'dark', themeColor: '#282c34' },
  { id: 'solarized-dark', label: 'Solarized Dark', polarity: 'dark', themeColor: '#002b36' },
  { id: 'github-dark', label: 'GitHub Dark', polarity: 'dark', themeColor: '#0d1117' },
  { id: 'ultimate-light', label: 'Ultimate Light', polarity: 'light', themeColor: '#f9fafb' },
  { id: 'warm-light', label: 'Warm Light', polarity: 'light', themeColor: '#faf7f2' },
  { id: 'catppuccin-latte', label: 'Catppuccin Latte', polarity: 'light', themeColor: '#eff1f5' },
  { id: 'gruvbox-light', label: 'Gruvbox Light', polarity: 'light', themeColor: '#fbf1c7' },
  { id: 'solarized-light', label: 'Solarized Light', polarity: 'light', themeColor: '#fdf6e3' },
  { id: 'github-light', label: 'GitHub Light', polarity: 'light', themeColor: '#ffffff' },
] as const satisfies readonly ThemePreset[]

export type ThemePresetId = (typeof THEME_PRESETS)[number]['id']

export interface FontPreset {
  id: string
  label: string
  css: string
}

const SANS_FALLBACK = "'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif"
const MONO_FALLBACK =
  "'JetBrains Mono', 'JetBrainsMono Nerd Font', 'JetBrainsMono NF', ui-monospace, 'SF Mono', Menlo, Consolas, monospace"

export const UI_FONTS = [
  { id: 'inter', label: 'Inter', css: SANS_FALLBACK },
  {
    id: 'system',
    label: 'System',
    css: '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  },
  { id: 'dm-sans', label: 'DM Sans', css: `"DM Sans", ${SANS_FALLBACK}` },
  { id: 'manrope', label: 'Manrope', css: `"Manrope", ${SANS_FALLBACK}` },
  { id: 'ibm-plex-mono', label: 'IBM Plex Mono', css: `"IBM Plex Mono", ${MONO_FALLBACK}` },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono Nerd',
    css: `"JetBrainsMono Nerd Font", "JetBrains Mono", ${MONO_FALLBACK}`,
  },
  {
    id: 'jetbrains-nl',
    label: 'JetBrains Mono NL Nerd',
    css: `"JetBrainsMonoNL Nerd Font", "JetBrains Mono NL", ${MONO_FALLBACK}`,
  },
  {
    id: 'mononoki',
    label: 'Mononoki Nerd',
    css: `"Mononoki Nerd Font", "Mononoki", ${MONO_FALLBACK}`,
  },
  {
    id: 'firacode',
    label: 'FiraCode Nerd',
    css: `"FiraCode Nerd Font", "Fira Code", ${MONO_FALLBACK}`,
  },
  { id: 'hack', label: 'Hack Nerd', css: `"Hack Nerd Font", "Hack", ${MONO_FALLBACK}` },
  {
    id: 'dankmono',
    label: 'DankMono Nerd',
    css: `"DankMono Nerd Font", "Dank Mono", ${MONO_FALLBACK}`,
  },
] as const satisfies readonly FontPreset[]

export type UiFontId = (typeof UI_FONTS)[number]['id']

export const CODE_FONTS = [
  { id: 'jetbrains-mono', label: 'JetBrains Mono', css: MONO_FALLBACK },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono Nerd',
    css: `"JetBrainsMono Nerd Font", "JetBrainsMono NF", ${MONO_FALLBACK}`,
  },
  {
    id: 'jetbrains-nl',
    label: 'JetBrains Mono NL Nerd',
    css: `"JetBrainsMonoNL Nerd Font", "JetBrains Mono NL", ${MONO_FALLBACK}`,
  },
  { id: 'ibm-plex-mono', label: 'IBM Plex Mono', css: `"IBM Plex Mono", ${MONO_FALLBACK}` },
  {
    id: 'firacode',
    label: 'FiraCode Nerd',
    css: `"FiraCode Nerd Font", "Fira Code", ${MONO_FALLBACK}`,
  },
  { id: 'hack', label: 'Hack Nerd', css: `"Hack Nerd Font", "Hack", ${MONO_FALLBACK}` },
  {
    id: 'mononoki',
    label: 'Mononoki Nerd',
    css: `"Mononoki Nerd Font", "Mononoki", ${MONO_FALLBACK}`,
  },
  {
    id: 'dankmono',
    label: 'DankMono Nerd',
    css: `"DankMono Nerd Font", "Dank Mono", ${MONO_FALLBACK}`,
  },
  {
    id: 'system-mono',
    label: 'System Mono',
    css: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
  },
] as const satisfies readonly FontPreset[]

export type CodeFontId = (typeof CODE_FONTS)[number]['id']

export const STORAGE_KEYS = {
  polarity: 'ultimate.theme',
  preset: 'ultimate.theme.preset',
  lastDark: 'ultimate.theme.dark',
  lastLight: 'ultimate.theme.light',
  uiFont: 'ultimate.font.ui',
  codeFont: 'ultimate.font.code',
} as const

export interface AppearanceState {
  preset: ThemePresetId
  uiFont: UiFontId
  codeFont: CodeFontId
}

export function isThemePresetId(value: unknown): value is ThemePresetId {
  return THEME_PRESETS.some((preset) => preset.id === value)
}

export function isUiFontId(value: unknown): value is UiFontId {
  return UI_FONTS.some((font) => font.id === value)
}

export function isCodeFontId(value: unknown): value is CodeFontId {
  return CODE_FONTS.some((font) => font.id === value)
}

export function getThemePreset(id: ThemePresetId): (typeof THEME_PRESETS)[number] {
  return THEME_PRESETS.find((preset) => preset.id === id) ?? THEME_PRESETS[0]
}

const GENERIC_FAMILIES = new Set(
  [SANS_FALLBACK, MONO_FALLBACK, '-apple-system, BlinkMacSystemFont, system-ui']
    .join(',')
    .split(',')
    .map(familyName),
)

function familyName(entry: string): string {
  return entry.trim().replace(/^['"]|['"]$/g, '')
}

/** Families a font option needs installed locally: those before its built-in fallback stack. */
export function localFamilies(font: FontPreset): string[] {
  const families: string[] = []
  for (const family of font.css.split(',').map(familyName)) {
    if (GENERIC_FAMILIES.has(family)) break
    families.push(family)
  }
  return families
}

export function getUiFont(id: UiFontId): (typeof UI_FONTS)[number] {
  return UI_FONTS.find((font) => font.id === id) ?? UI_FONTS[0]
}

export function getCodeFont(id: CodeFontId): (typeof CODE_FONTS)[number] {
  return CODE_FONTS.find((font) => font.id === id) ?? CODE_FONTS[0]
}

export function preferredPresetForPolarity(
  polarity: Polarity,
  storage?: Pick<Storage, 'getItem'>,
): ThemePresetId {
  const key = polarity === 'dark' ? STORAGE_KEYS.lastDark : STORAGE_KEYS.lastLight
  const saved = storage?.getItem(key)
  if (isThemePresetId(saved) && getThemePreset(saved).polarity === polarity) return saved
  return polarity === 'dark' ? 'ultimate-dark' : 'ultimate-light'
}

function defaultPolarity(storage?: Pick<Storage, 'getItem'>): Polarity {
  const stored = storage?.getItem(STORAGE_KEYS.polarity)
  if (stored === 'light' || stored === 'dark') return stored
  if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches)
    return 'light'
  return 'dark'
}

export function readStoredAppearance(
  storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage !== 'undefined'
    ? localStorage
    : undefined,
  fallbackPolarity?: Polarity,
): AppearanceState {
  const rawPreset = storage?.getItem(STORAGE_KEYS.preset)
  const rawPolarity = fallbackPolarity ?? defaultPolarity(storage)
  let preset: ThemePresetId =
    isThemePresetId(rawPreset) && getThemePreset(rawPreset).polarity === rawPolarity
      ? rawPreset
      : preferredPresetForPolarity(rawPolarity, storage)
  if (fallbackPolarity && getThemePreset(preset).polarity !== fallbackPolarity) {
    preset = preferredPresetForPolarity(fallbackPolarity, storage)
  }
  const rawUiFont = storage?.getItem(STORAGE_KEYS.uiFont)
  const rawCodeFont = storage?.getItem(STORAGE_KEYS.codeFont)
  return {
    preset,
    uiFont: isUiFontId(rawUiFont) ? rawUiFont : 'inter',
    codeFont: isCodeFontId(rawCodeFont) ? rawCodeFont : 'jetbrains-mono',
  }
}

export function saveAppearance(
  state: AppearanceState,
  storage: Pick<Storage, 'setItem'> | undefined = typeof localStorage !== 'undefined'
    ? localStorage
    : undefined,
) {
  if (!storage) return
  const theme = getThemePreset(state.preset)
  storage.setItem(STORAGE_KEYS.preset, state.preset)
  storage.setItem(STORAGE_KEYS.polarity, theme.polarity)
  storage.setItem(
    theme.polarity === 'dark' ? STORAGE_KEYS.lastDark : STORAGE_KEYS.lastLight,
    state.preset,
  )
  storage.setItem(STORAGE_KEYS.uiFont, state.uiFont)
  storage.setItem(STORAGE_KEYS.codeFont, state.codeFont)
}

export function applyAppearanceToDom(
  state: AppearanceState,
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined,
) {
  if (!doc) return
  const root = doc.documentElement
  const theme = getThemePreset(state.preset)
  const uiFont = getUiFont(state.uiFont)
  const codeFont = getCodeFont(state.codeFont)
  root.dataset.theme = theme.id
  root.classList.toggle('dark', theme.polarity === 'dark')
  // Always mutate `style` on `documentElement` so observers watching `style` (such as terminal's xterm observer)
  // re-read computed theme tokens and fonts even when switching between two presets of the same dark/light polarity.
  root.style.setProperty('--theme-preset', theme.id)
  root.style.setProperty('--font-sans', uiFont.css)
  root.style.setProperty('--font-mono', codeFont.css)
  doc.querySelector('meta[name=theme-color]')?.setAttribute('content', theme.themeColor)
}
