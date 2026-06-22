import type { ThemePlugin } from '@madside/ports'

// A light palette (#118), GitHub-light-flavoured to pair with the default dark.
// Accents are darkened so they keep contrast on light backgrounds.
export const lightTheme: ThemePlugin = {
  kind: 'theme',
  id: 'light',
  name: 'Light',
  tokens: {
    'bg-primary': '#ffffff',
    'bg-secondary': '#f6f8fa',
    'bg-tertiary': '#eaeef2',
    'bg-outer': '#d0d7de',

    'border-subtle': '#eaeef2',
    'border-default': '#d0d7de',
    'border-muted': '#afb8c1',

    'text-primary': '#1f2328',
    'text-heading': '#010409',
    'text-secondary': '#57606a',
    'text-tertiary': '#6e7781',
    'text-quaternary': '#afb8c1',

    'accent-mint': '#1a7f37',
    'accent-amber': '#9a6700',
    'accent-coral': '#cf222e',
    'accent-peach': '#bc4c00',
  },
}
