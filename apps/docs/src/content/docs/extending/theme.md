---
title: Theme plugins
description: Contribute a colour palette as a plugin — design tokens applied as CSS custom properties.
sidebar:
  order: 10
---

A **theme plugin** contributes a colour palette. The host applies it as CSS custom
properties on the document root, so the whole UI — including the Dockview chrome,
which maps its `--dv-*` variables onto these tokens — re-skins at once. Two themes
ship built-in: **dark** (`@madside/theme-dark`) and **light** (`@madside/theme-light`).

Themes are **built-in only** (registered at workbench startup, like machines and
panels).

## The contract

Source: `@ports/plugin-theme.ts`.

```ts
interface ThemePlugin extends PluginBase {
  readonly kind: 'theme'
  readonly tokens: ThemeTokens   // every canonical token → a CSS colour value
}

type ThemeTokens = Record<ThemeTokenName, string>
```

`ThemeTokenName` is the fixed set of **colour** tokens a theme must provide. Non-colour
tokens (fonts, sizes) live in the app's base stylesheet and aren't theme-controlled:

| Group | Tokens |
|-------|--------|
| Backgrounds | `bg-primary`, `bg-secondary`, `bg-tertiary`, `bg-outer` |
| Borders | `border-subtle`, `border-default`, `border-muted` |
| Text | `text-primary`, `text-heading`, `text-secondary`, `text-tertiary`, `text-quaternary` |
| Accents | `accent-mint`, `accent-amber`, `accent-coral`, `accent-peach` |

The host sets each as `--<name>` on `:root` (so `bg-primary` becomes the CSS variable
`--bg-primary`). Every component — and the Dockview layout — reads these variables, so
a theme is purely data: no component code changes.

## Hello-world

```ts
import type { ThemePlugin } from '@ports'

export const midnightTheme: ThemePlugin = {
  id: 'midnight',
  kind: 'theme',
  name: 'Midnight',
  tokens: {
    'bg-primary': '#0b0d17',
    'bg-secondary': '#11142020',
    'bg-tertiary': '#1a1f2e',
    'bg-outer': '#070810',
    'border-subtle': '#1c2130',
    'border-default': '#2a3142',
    'border-muted': '#161b27',
    'text-primary': '#e6e9f0',
    'text-heading': '#ffffff',
    'text-secondary': '#aab2c5',
    'text-tertiary': '#7c8499',
    'text-quaternary': '#525a6e',
    'accent-mint': '#6ee7b7',
    'accent-amber': '#fbbf24',
    'accent-coral': '#fb7185',
    'accent-peach': '#fdba74',
  },
}
```

Register it like any other plugin:

```ts
plugins.register({ plugin: midnightTheme, source: { origin: 'builtin' } })
```

`TypeScript` enforces completeness — `ThemeTokens` is a `Record` over every
`ThemeTokenName`, so omitting a token is a compile error. That guarantees a theme can
never half-skin the UI.
