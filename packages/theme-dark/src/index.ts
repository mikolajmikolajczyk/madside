import type { ThemePlugin } from '@madside/ports'

// The default dark palette (#118). Values mirror the app's base tokens.css
// (originally from mikolajczyk.org); this is the theme seeded on first load.
export const darkTheme: ThemePlugin = {
  kind: 'theme',
  id: 'dark',
  name: 'Dark',
  tokens: {
    'bg-primary': '#0d1117',
    'bg-secondary': '#161b22',
    'bg-tertiary': '#0a0e14',
    'bg-outer': '#1a1a1a',

    'border-subtle': '#161b22',
    'border-default': '#21262d',
    'border-muted': '#4a5159',

    'text-primary': '#c9d1d9',
    'text-heading': '#f0f6fc',
    'text-secondary': '#8b949e',
    'text-tertiary': '#838b94',
    'text-quaternary': '#4a5159',

    'accent-mint': '#4ade80',
    'accent-amber': '#fbbf24',
    'accent-coral': '#f87171',
    'accent-peach': '#f0883e',
  },
}
