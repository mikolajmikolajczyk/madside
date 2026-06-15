// Map a keyboard event to a canonical shortcut string ("Ctrl+Enter", "F10",
// "Ctrl+Shift+.") matching the `Command.shortcut` convention. The non-modifier
// key is read from `event.code` (the physical key) so it's layout-independent —
// Shift+'.' stays "." instead of becoming ">" on a US layout.

/** Physical-key code → the token used in shortcut strings. Returns null for
 *  keys we never bind (so the dispatcher ignores them). */
function codeToToken(code: string): string | null {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3) // KeyB -> B
  if (/^Digit[0-9]$/.test(code)) return code.slice(5) // Digit1 -> 1
  if (/^F([1-9]|1[0-2])$/.test(code)) return code // F1..F12 verbatim
  switch (code) {
    case 'Enter':
    case 'NumpadEnter':
      return 'Enter'
    case 'Period':
    case 'NumpadDecimal':
      return '.'
    case 'Comma':
      return ','
    case 'Slash':
      return '/'
    case 'Space':
      return 'Space'
    default:
      return null
  }
}

/** KeyboardEvent fields the formatter needs (a subset, so it's trivially
 *  testable without a DOM event). */
export interface ShortcutEvent {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

/** Canonical "Ctrl+Shift+." style string, or null for an unbindable key.
 *  Ctrl and Cmd (meta) both render as "Ctrl" so one binding serves both. */
export function eventToShortcut(e: ShortcutEvent): string | null {
  const token = codeToToken(e.code)
  if (!token) return null
  const parts: string[] = []
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl')
  if (e.altKey) parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  parts.push(token)
  return parts.join('+')
}
