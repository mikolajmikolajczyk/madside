// sccz80 CDB frame-local parsing (#136). With `-frameix -debug-defc`, sccz80 sets
// up IX as a true frame pointer (`push ix; ld ix,0; add ix,sp`) and emits SDCC-cdb
// symbol records as `defc __CDBINFO__<mangled> = 1` lines, where <mangled> is the
// cdb record text with every non-alphanumeric byte hex-escaped as `_XX`. Each
// on-stack symbol record carries its **IX-relative offset** — stable across the
// whole function body (unlike cc65's moving c_sp), so locals resolve reliably.
//
// We decode those records into per-function frame variables (name + IX offset).
// The toolchain joins them with lsp-c types + function addresses to build the
// language-neutral DebugInfo.scopes the Variables panel consumes.

/** One frame variable (parameter or local): IX-relative byte offset + its C name,
 *  owning function, and source file. Offset is signed (params above the frame > 0,
 *  locals below < 0). */
export interface CdbFrameVar {
  file: string
  func: string
  name: string
  offset: number
}

/** Decode an `__CDBINFO__`-mangled token back to its cdb record text: every
 *  `_XX` (two hex digits) is the escaped byte, everything else is literal. */
function demangle(s: string): string {
  return s.replace(/_([0-9a-fA-F]{2})/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))
}

// An SDCC symbol record: `S:L<file>.<func>$<name>$<lvl>_<blk>$<dis>(<type>),<addrspace>,<onstack>,<offset>[,...]`
// We only want function-scope (`L`) on-stack (`,...,1,<offset>`) variables. The
// file may contain dots (`src/main.c`), so the func is the segment after the LAST
// dot before the first `$`.
const SYMREC_RE = /^S:L(.+)\.([A-Za-z_]\w*)\$([A-Za-z_]\w*)\$.*\),([A-Za-z]),([01]),(-?\d+)/

/** Parse all `__CDBINFO__` defc lines out of sccz80 asm text into frame
 *  variables. Non-symbol cdb records (functions `F:`, types `T:`, linker `L:`)
 *  and non-stack symbols (globals) are skipped. */
export function parseCdbFrameVars(asm: string): CdbFrameVar[] {
  const out: CdbFrameVar[] = []
  const seen = new Set<string>()
  for (const line of asm.split('\n')) {
    const m = /__CDBINFO__([0-9A-Za-z_]+)/.exec(line)
    if (!m) continue
    const rec = demangle(m[1]!)
    const s = SYMREC_RE.exec(rec)
    if (!s) continue
    const onStack = s[5] === '1'
    if (!onStack) continue // a global/static, not a frame variable
    const key = `${s[1]} ${s[2]} ${s[3]}`
    if (seen.has(key)) continue // record appears as both PUBLIC and defc
    seen.add(key)
    out.push({ file: s[1]!, func: s[2]!, name: s[3]!, offset: parseInt(s[6]!, 10) })
  }
  return out
}
