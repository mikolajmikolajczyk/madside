// cc65 sysroot headers for the C LSP. The cc65-intel engine indexes these to
// offer stdlib completion (conio/stdlib) + hardware register structs (VIC/SID),
// and to drive auto-`#include`. The host (madside) reads them from the mounted
// sysroot zip (VFS) and hands them to the LSP via `initializationOptions`.
//
// Lives in @app (not @ui) because resolving the sysroot crosses into the
// toolchain plugin (@plugins) — which @ui may not import directly. The editor
// calls this through the @app barrel.

import { sysrootFor, targetFor } from '@madside/toolchain-ca65'
import type { SourceFile } from '@madside/lsp-core'

// Headers don't change at runtime — cache the decoded set per cc65 target.
const cache = new Map<string, SourceFile[]>()
const decoder = new TextDecoder()

// Predefined macros cc65 sets per `-t` target. The LSP needs them to resolve
// the preprocessor target gating (`<target.h>` → `#if defined(__C64__)` →
// c64.h, not agat.h) so cross-target completion noise + false redefinition
// diagnostics go away (cc65-intel #30). CBM machines need the `__CBM__` family
// macro too — the chain is target.h →(__CBM__)→ cbm.h →(__C64__)→ c64.h. This
// is the only cc65-specific knowledge the host adds; the engine stays
// target-agnostic (it just evaluates `#if defined(X)`).
const CC65_TARGET_DEFINES: Record<string, string[]> = {
  c64: ['__C64__', '__CBM__', '__CC65__'],
  atari: ['__ATARI__', '__CC65__'],
  nes: ['__NES__', '__CC65__'],
}

/** The macros that are `#define`d for a machine's cc65 target, or undefined when
 *  the machine has no mapped target (→ the LSP falls back to flat indexing). */
export function cc65TargetDefines(machine?: string): Record<string, string> | undefined {
  const target = targetFor(machine)
  const names = target ? CC65_TARGET_DEFINES[target] : undefined
  if (!names) return undefined
  return Object.fromEntries(names.map((n) => [n, '1']))
}

/** Decoded `.h` files from the cc65 sysroot for a machine's target, or `[]` when
 *  the machine has no cc65 target / no bundled sysroot. */
export async function cc65SysrootHeaders(machine?: string): Promise<SourceFile[]> {
  const target = targetFor(machine)
  if (!target) return []
  const cached = cache.get(target)
  if (cached) return cached

  const provider = sysrootFor(target)
  if (!provider) return []

  const headers: SourceFile[] = []
  for (const path of await provider.list('include')) {
    if (!path.endsWith('.h')) continue
    const bytes = await provider.read(path)
    if (bytes) headers.push({ path, text: decoder.decode(bytes) })
  }
  cache.set(target, headers)
  return headers
}
