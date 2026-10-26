import { TypeIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn, defineWebExtension, getState, useStore, useUltimate } from '@/sdk'
import {
  applyAppearanceToDom,
  CODE_FONTS,
  getThemePreset,
  isCodeFontId,
  isThemePresetId,
  isUiFontId,
  preferredPresetForPolarity,
  readStoredAppearance,
  saveAppearance,
  THEME_PRESETS,
  UI_FONTS,
} from './presets.ts'
import type { AppearanceState, CodeFontId, Polarity, ThemePresetId, UiFontId } from './presets.ts'

const CHANGED_EVENT = 'ultimate:appearance-changed'
const OPEN_EVENT = 'ultimate:appearance-open'

const darkPresets = THEME_PRESETS.filter((preset) => preset.polarity === 'dark')
const lightPresets = THEME_PRESETS.filter((preset) => preset.polarity === 'light')

function broadcastAppearance() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGED_EVENT))
}

export function setThemePreset(
  preset: ThemePresetId,
  setPolarity?: (polarity: Polarity) => void,
): AppearanceState {
  const current = readStoredAppearance()
  const next: AppearanceState = { ...current, preset }
  const theme = getThemePreset(preset)
  saveAppearance(next)
  applyAppearanceToDom(next)
  setPolarity?.(theme.polarity)
  broadcastAppearance()
  return next
}

export function setUiFont(uiFont: UiFontId): AppearanceState {
  const current = readStoredAppearance()
  const next: AppearanceState = { ...current, uiFont }
  saveAppearance(next)
  applyAppearanceToDom(next)
  broadcastAppearance()
  return next
}

export function setCodeFont(codeFont: CodeFontId): AppearanceState {
  const current = readStoredAppearance()
  const next: AppearanceState = { ...current, codeFont }
  saveAppearance(next)
  applyAppearanceToDom(next)
  broadcastAppearance()
  return next
}

export function togglePolarity(
  currentPolarity: Polarity,
  setPolarity?: (polarity: Polarity) => void,
): AppearanceState {
  const target: Polarity = currentPolarity === 'dark' ? 'light' : 'dark'
  const preset = preferredPresetForPolarity(target)
  return setThemePreset(preset, setPolarity)
}

function useAppearance() {
  const polarity = useStore((state) => state.ui.theme)
  const { setTheme } = useUltimate()
  const [state, setState] = useState<AppearanceState>(() => readStoredAppearance())

  useEffect(() => {
    const sync = () => {
      const next = readStoredAppearance()
      applyAppearanceToDom(next)
      setState(next)
    }
    sync()
    window.addEventListener(CHANGED_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(CHANGED_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [])

  // Keep preset coherent if another caller invoked `context.setTheme('light' | 'dark')` directly.
  useEffect(() => {
    const current = readStoredAppearance()
    if (getThemePreset(current.preset).polarity !== polarity) {
      const nextPreset = preferredPresetForPolarity(polarity)
      const next = { ...current, preset: nextPreset }
      saveAppearance(next)
      applyAppearanceToDom(next)
      setState(next)
    }
  }, [polarity])

  return {
    state,
    selectPreset: (preset: ThemePresetId) => setState(setThemePreset(preset, setTheme)),
    selectUiFont: (uiFont: UiFontId) => setState(setUiFont(uiFont)),
    selectCodeFont: (codeFont: CodeFontId) => setState(setCodeFont(codeFont)),
  }
}

const selectClass =
  'h-7 min-w-0 flex-1 cursor-pointer rounded-md border border-border bg-secondary/70 px-2 font-sans text-[12px] text-foreground outline-none transition-colors hover:border-border focus-visible:ring-1 focus-visible:ring-ring'

function AppearanceMenu() {
  const { state, selectPreset, selectUiFont, selectCodeFont } = useAppearance()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <button
              aria-expanded={open}
              aria-haspopup="dialog"
              aria-label="Appearance"
              className={cn(
                'flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring',
                open && 'bg-accent text-brand',
              )}
              data-appearance-trigger=""
              type="button"
            >
              <TypeIcon className="size-3.5" />
            </button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">Theme and fonts</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        aria-label="Appearance settings"
        className="w-64 p-3 font-sans text-[12px]"
        data-appearance-popover=""
        sideOffset={6}
      >
        <div className="grid gap-2.5">
          <label className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2 text-[11.5px] font-medium text-muted-foreground">
            <span>Theme</span>
            <select
              aria-label="Color theme"
              className={selectClass}
              onChange={(event) => {
                const value = event.target.value
                if (isThemePresetId(value)) selectPreset(value)
              }}
              value={state.preset}
            >
              <optgroup label="Dark">
                {darkPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Light">
                {lightPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2 text-[11.5px] font-medium text-muted-foreground">
            <span>UI font</span>
            <select
              aria-label="UI font"
              className={selectClass}
              onChange={(event) => {
                const value = event.target.value
                if (isUiFontId(value)) selectUiFont(value)
              }}
              value={state.uiFont}
            >
              {UI_FONTS.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2 text-[11.5px] font-medium text-muted-foreground">
            <span>Code font</span>
            <select
              aria-label="Code font"
              className={selectClass}
              onChange={(event) => {
                const value = event.target.value
                if (isCodeFontId(value)) selectCodeFont(value)
              }}
              value={state.codeFont}
            >
              {CODE_FONTS.map((font) => (
                <option key={font.id} value={font.id}>
                  {font.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default defineWebExtension({
  slots: {
    'titlebar.right': [AppearanceMenu],
  },
  commands: [
    {
      id: 'theme.toggle',
      title: 'Toggle light and dark theme',
      group: 'Ultimate',
      run: (context) => {
        togglePolarity(getState().ui.theme, context.setTheme)
      },
    },
    {
      id: 'theme.appearance',
      title: 'Change theme and fonts…',
      group: 'Ultimate',
      run: () => {
        window.dispatchEvent(new Event(OPEN_EVENT))
      },
    },
  ],
})
