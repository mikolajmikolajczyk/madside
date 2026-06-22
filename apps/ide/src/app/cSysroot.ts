// Sysroot headers + predefined macros for the C LSP. The C language server
// indexes the sysroot headers to offer stdlib completion + hardware register
// structs, and to drive auto-`#include`. The host (madside) reads them from the
// mounted sysroot zip (VFS) and hands them to the LSP via `initializationOptions`.
//
// Two C toolchains feed this: cc65 (6502) and z88dk/sccz80 (Z80). The editor
// uses the target-neutral dispatchers (`cTargetDefines` / `cSysrootHeaders` /
// `cLspTarget`) — they branch on which toolchain owns the active machine.
//
// Lives in @app (not @ui) because resolving the sysroot crosses into the
// toolchain plugins (@plugins) — which @ui may not import directly. The editor
// calls this through the @app barrel.

import {
  sysrootFor as cc65SysrootFor,
  targetFor as cc65TargetFor,
} from '@madside/toolchain-ca65'
import {
  sysrootFor as z88dkSysrootFor,
  targetFor as z88dkTargetFor,
} from '@madside/toolchain-z88dk'
import type { SourceFile } from '@madside/lsp-core'

/** Which in-repo C language server backs a machine: the z88dk/sccz80 (Z80)
 *  server when z88dk owns the machine, else the cc65 (6502) server (default). */
export type CLspTarget = 'cc65' | 'z80'

// A provider exposing the sysroot headers — both toolchains' `sysrootFor` return
// one shaped like this (ZipAssetProvider). Narrowed to what header indexing needs.
interface SysrootProvider {
  list(prefix: string): Promise<string[]>
  read(path: string): Promise<Uint8Array | undefined>
}

// Headers don't change at runtime — cache the decoded set per resolved target.
const cache = new Map<string, SourceFile[]>()
const decoder = new TextDecoder()

// Predefined macros cc65 sets per `-t` target. The LSP needs them to resolve
// the preprocessor target gating (`<target.h>` → `#if defined(__C64__)` →
// c64.h, not agat.h) so cross-target completion noise + false redefinition
// diagnostics go away (#30). CBM machines need the `__CBM__` family
// macro too — the chain is target.h →(__CBM__)→ cbm.h →(__C64__)→ c64.h.
const CC65_TARGET_DEFINES: Record<string, string[]> = {
  c64: ['__C64__', '__CBM__', '__CC65__'],
  atari: ['__ATARI__', '__CC65__'],
  nes: ['__NES__', '__CC65__'],
}

// Predefined macros for the z88dk/sccz80 +zx classic path. The bundled headers
// gate on these (e.g. stdio.h `#ifdef __SPECTRUM__`) — defining them lets the
// engine's reachability BFS (#30) keep indexing bounded once the ZX target is
// pinned.
const Z88DK_TARGET_DEFINES: Record<string, string[]> = {
  '+zx': ['__SPECTRUM__', '__SCCZ80', '__Z88DK'],
}

/** The C LSP backing a machine: 'z80' when z88dk owns it, else 'cc65'. */
export function cLspTarget(machine?: string): CLspTarget {
  return z88dkTargetFor(machine) ? 'z80' : 'cc65'
}

/** The macros that are `#define`d for a machine's C target, or undefined when no
 *  C toolchain owns the machine (→ the LSP falls back to flat indexing). */
export function cTargetDefines(machine?: string): Record<string, string> | undefined {
  const cc65 = cc65TargetFor(machine)
  if (cc65) return definesFrom(CC65_TARGET_DEFINES[cc65])
  const z88dk = z88dkTargetFor(machine)
  if (z88dk) return definesFrom(Z88DK_TARGET_DEFINES[z88dk])
  return undefined
}

function definesFrom(names: string[] | undefined): Record<string, string> | undefined {
  if (!names) return undefined
  return Object.fromEntries(names.map((n) => [n, '1']))
}

/** Decoded `.h` files from the C sysroot for a machine's target, or `[]` when no
 *  C toolchain owns the machine / no bundled sysroot. Cached per resolved target. */
export async function cSysrootHeaders(machine?: string): Promise<SourceFile[]> {
  const cc65 = cc65TargetFor(machine)
  if (cc65) return headersFrom(`cc65:${cc65}`, cc65SysrootFor(cc65))
  const z88dk = z88dkTargetFor(machine)
  if (z88dk) return headersFrom(`z88dk:${z88dk}`, z88dkSysrootFor(z88dk))
  return []
}

async function headersFrom(
  key: string,
  provider: SysrootProvider | undefined,
): Promise<SourceFile[]> {
  if (!provider) return []
  const cached = cache.get(key)
  if (cached) return cached

  const headers: SourceFile[] = []
  for (const path of await provider.list('include')) {
    if (!path.endsWith('.h')) continue
    const bytes = await provider.read(path)
    if (bytes) headers.push({ path, text: decoder.decode(bytes) })
  }
  cache.set(key, headers)
  return headers
}
