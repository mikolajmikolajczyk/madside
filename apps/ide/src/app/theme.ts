import type { ThemeTokens } from '@ports'

// Theme applier (#118). A ThemePlugin's token map is written as CSS custom
// properties (`--<name>`) on the document root, overriding the base tokens.css
// defaults; the dockview theme + every component read these vars, so the whole
// UI re-skins. The choice persists in localStorage.

const THEME_KEY = 'madside.theme'

export function applyTheme(tokens: ThemeTokens): void {
  const root = document.documentElement
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(`--${name}`, value)
  }
}

export function loadThemeId(fallback: string): string {
  return localStorage.getItem(THEME_KEY) ?? fallback
}

export function saveThemeId(id: string): void {
  localStorage.setItem(THEME_KEY, id)
}
