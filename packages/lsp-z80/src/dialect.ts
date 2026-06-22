import type { CDialect, ExtraDecl } from '@madside/lsp-c'

// z88dk declares many stdio/file functions through the `__ZPROTO<N>(...)` macro
// family (sys/proto.h), which the C grammar can't expand — so blanking them
// (see `decorators`) drops those functions. Recover them by parsing the macro
// call directly. Layout: `__ZPROTO<N>(ret, ptr, name, t1,a1, t2,a2, …)` expands
// to `extern ret ptr name(t1 a1, t2 a2, …)` (ptr is `*` for pointer returns,
// empty otherwise). e.g. `__ZPROTO2(FILE,*,fopen,const char *,name,const char *,mode)`
// → `FILE * fopen(const char *name, const char *mode)`.
const ZPROTO = /__ZPROTO\w*\s*\(([^)]*)\)/g
const zprotoDecls: (text: string) => ExtraDecl[] = (text) => {
  const out: ExtraDecl[] = []
  ZPROTO.lastIndex = 0
  for (let m = ZPROTO.exec(text); m; m = ZPROTO.exec(text)) {
    const args = (m[1] ?? '').split(',').map((a) => a.trim())
    if (args.length < 3) continue
    const name = args[2] ?? ''
    if (!/^[A-Za-z_]\w*$/.test(name)) continue
    const ret = `${args[0] ?? ''} ${args[1] ?? ''}`.trim()
    const params: string[] = []
    for (let i = 3; i + 1 < args.length; i += 2) params.push(`${args[i]} ${args[i + 1]}`.trim())
    out.push({ name, detail: `${ret} ${name}(${params.join(', ')})`, params, offset: m.index })
  }
  return out
}

// z88dk/sccz80 (Z80) C dialect. sccz80 decorates declarations with calling-
// convention + section macros (__z88dk_fastcall/__naked/fastcall/…) that the
// standard C grammar chokes on — blank them before parsing. Diagnostics:
// analysis source `z88dk-intel`, build source `z88dk` (sccz80/z80asm output,
// parsed by the engine). The host pushes raw z88dk build output on the
// `z88dk/buildOutput` notification.
export const z80Dialect: CDialect = {
  // z88dk decorates declarations heavily (__LIB__ 6k×, __smallc 4k×, the
  // __z88dk_* calling conventions, __sfr/__at port qualifiers, …) — blank them so
  // the C grammar parses the underlying declaration. The arg-carrying ones
  // (__preserves_regs(…), __at(…)) consume their parens too. __ZPROTO*(…) are
  // macro-defined prototypes the parser can't understand AND, left in, they
  // desync Lezer's recovery so the *next* real declarations (printf/fprintf/…)
  // go unindexed — so blank the whole call. (Cost: the handful of functions only
  // declared via __ZPROTO, e.g. fread/fwrite, aren't offered. Acceptable.)
  decorators:
    /\b(?:__LIB__|__smallc|__z88dk_fastcall|__z88dk_callee|__z88dk_deprecated|__z88dk_sdccdecl|__z88dk_params_offset|__z88dk_saveframe|__SAVEFRAME__|__vasmallc|__naked|__critical|__banked|__nonbanked|__sfr|__ROM__|__CALLEE__|__FASTCALL__|__stdc|fastcall|callee)\b|__preserves_regs\s*\([^)]*\)|__at\s*\([^)]*\)|__ZPROTO\w*\s*\([^)]*\)/g,
  diagnosticSource: 'z88dk-intel',
  buildDiagnosticSource: 'z88dk',
  buildOutputNotification: 'z88dk/buildOutput',
  completionTriggers: ['.', '>'],
  signatureTriggers: ['(', ','],
  extraDecls: zprotoDecls,
}
