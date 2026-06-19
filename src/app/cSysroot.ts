// cc65 sysroot headers for the C LSP. The cc65-intel engine indexes these to
// offer stdlib completion (conio/stdlib) + hardware register structs (VIC/SID),
// and to drive auto-`#include`. The host (madside) reads them from the mounted
// sysroot zip (VFS) and hands them to the LSP via `initializationOptions`.
//
// Lives in @app (not @ui) because resolving the sysroot crosses into the
// toolchain plugin (@plugins) — which @ui may not import directly. The editor
// calls this through the @app barrel.

import { sysrootFor, targetFor } from '@plugins/toolchain-ca65'
import type { SourceFile } from '@cc65-intel/core'

// Headers don't change at runtime — cache the decoded set per cc65 target.
const cache = new Map<string, SourceFile[]>()
const decoder = new TextDecoder()

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
