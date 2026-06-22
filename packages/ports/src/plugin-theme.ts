import type { PluginBase } from './plugin-registry'

// Theme contract (#118). A theme contributes a colour palette as a plugin; the
// host applies it as CSS custom properties on the document root, so the whole
// UI — including the dockview chrome (which maps `--dv-*` onto these) — re-skins.

/** The canonical design-token names a theme must provide — the theme API
 *  surface. Colour tokens only; non-colour tokens (font, sizes) stay in the
 *  app's base stylesheet and aren't theme-controlled. */
export type ThemeTokenName =
  | 'bg-primary'
  | 'bg-secondary'
  | 'bg-tertiary'
  | 'bg-outer'
  | 'border-subtle'
  | 'border-default'
  | 'border-muted'
  | 'text-primary'
  | 'text-heading'
  | 'text-secondary'
  | 'text-tertiary'
  | 'text-quaternary'
  | 'accent-mint'
  | 'accent-amber'
  | 'accent-coral'
  | 'accent-peach'

/** A complete palette: every canonical token mapped to a CSS colour value. */
export type ThemeTokens = Record<ThemeTokenName, string>

/** A colour theme. The host sets each token as `--<name>` on `:root`.
 *  PluginRegistry kind: 'theme'. */
export interface ThemePlugin extends PluginBase {
  readonly kind: 'theme'
  readonly tokens: ThemeTokens
}
