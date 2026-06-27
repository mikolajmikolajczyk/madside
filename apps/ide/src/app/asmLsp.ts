// Maps the active project toolchain id (manifest.toolchain) to the assembly LSP
// dialect the editor should run (@madside/lsp-asm).

const TOOLCHAIN_TO_DIALECT: Record<string, string> = {
  mads: 'mads',
  ca65: 'ca65',
  z88dk: 'z80asm',
  clownassembler: 'clownassembler',
}

/** The asm LSP dialect id for a file, or undefined if unsupported. Normally
 *  follows the project toolchain, but a `.s80` source is the Genesis Z80 driver
 *  — assembled by z80asm and embedded into the M68k ROM (#147), so it uses the
 *  z80 dialect regardless of the project's (clownassembler/M68k) toolchain.
 *  Without this its Z80 registers (`a`, `bc`, …) read as undefined symbols. */
export function asmDialectFor(toolchainId?: string, path?: string): string | undefined {
  if (path && /\.s80$/i.test(path)) return 'z80asm'
  return toolchainId ? TOOLCHAIN_TO_DIALECT[toolchainId] : undefined
}

// --- mixed-dialect classification (#148) -----------------------------------
// A project can mix asm dialects (Genesis: M68k `.asm` + z80 `.s80` driver). Each
// file is routed to its dialect's LSP worker. An *anchor* file's dialect is set by
// its extension/toolchain; an *include* (`.inc`/`.mac`) has no inherent dialect and
// inherits from the files that include it — so a `.inc` pulled in by a `.s80`
// resolves z80, and a `.inc` shared by an `.asm` and a `.s80` belongs to BOTH.

const Z80_EXT = /\.(s80|z80)$/i
const ANCHOR_EXT = /\.(asm|a65|s)$/i // a definite source (vs an include)
// `[label[:]] include|incbin "path"` — the include directive every dialect shares.
const INCLUDE_DIRECTIVE = /^\s*(?:[A-Za-z_.@$][\w.@$]*:?\s+)?(?:include|incbin)\s+["']([^"']+)["']/i

/** The dialect a file declares by its own extension, or undefined for an include
 *  (which inherits from its includers). */
function anchorDialect(path: string, toolchainId?: string): string | undefined {
  if (Z80_EXT.test(path)) return 'z80asm'
  if (ANCHOR_EXT.test(path)) return toolchainId ? TOOLCHAIN_TO_DIALECT[toolchainId] : undefined
  return undefined
}

/** How a file maps to the LSP: `dialects` = every worker it must be synced to;
 *  `owner` = the one dialect whose diagnostics win (others' are suppressed so a
 *  shared include doesn't get conflicting squiggles). */
export interface AsmFileDialects {
  dialects: string[]
  owner: string
}

/** Classify a project's asm sources by dialect (#148). Anchors get their
 *  extension/toolchain dialect; includes inherit (transitively) from whoever
 *  includes them. Files with no resolved dialect (non-asm, or an orphan include)
 *  are omitted. */
export function classifyAsmDialects(
  files: readonly { path: string; text: string }[],
  toolchainId?: string,
): Map<string, AsmFileDialects> {
  const known = new Set(files.map((f) => f.path))
  const textByPath = new Map(files.map((f) => [f.path, f.text]))
  const resolve = (inc: string, from: string): string | undefined => {
    if (known.has(inc)) return inc
    const slash = from.lastIndexOf('/')
    const dir = slash >= 0 ? from.slice(0, slash + 1) : ''
    if (known.has(dir + inc)) return dir + inc
    const base = inc.split('/').pop()!
    for (const p of known) if (p === base || p.endsWith('/' + base)) return p
    return undefined
  }

  const sets = new Map<string, Set<string>>()
  const add = (path: string, d: string) => {
    let s = sets.get(path)
    if (!s) { s = new Set(); sets.set(path, s) }
    s.add(d)
  }

  // Anchors first, then propagate each anchor's dialect down its include graph.
  const anchors: { path: string; dialect: string }[] = []
  for (const f of files) {
    const d = anchorDialect(f.path, toolchainId)
    if (d) { add(f.path, d); anchors.push({ path: f.path, dialect: d }) }
  }
  const propagate = (path: string, dialect: string, seen: Set<string>): void => {
    const text = textByPath.get(path)
    if (text == null) return
    for (const line of text.split('\n')) {
      const m = INCLUDE_DIRECTIVE.exec(line)
      if (!m) continue
      const target = resolve(m[1]!, path)
      if (!target) continue
      add(target, dialect)
      const key = dialect + '\0' + target
      if (!seen.has(key)) { seen.add(key); propagate(target, dialect, seen) }
    }
  }
  for (const a of anchors) propagate(a.path, a.dialect, new Set())

  const out = new Map<string, AsmFileDialects>()
  for (const [path, set] of sets) {
    const owner = anchorDialect(path, toolchainId) ?? [...set][0]!
    out.set(path, { dialects: [...set], owner })
  }
  return out
}
