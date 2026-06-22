import type { DebugSymbol, DebugType } from '@ports'
import { pointerTarget } from './decode'

// Watch-expression evaluator (#132). Resolves an expression against the typed
// symbol table (DebugInfo) + memory into a typed location (addr + type) the
// panel reads + decodes with the same machinery as globals. Grammar (v1):
//
//   unary   := '*'* postfix
//   postfix := ident ( '.' ident | '->' ident | '[' number ']' )*
//
// Covers `score`, `pos.x`, `p->next->v`, `arr[3]`, `*ptr`, `**pp`, `arr[2].x`.
// Reads run on deref / `->` / pointer-subscript. Pure aside from the injected
// reader; language-agnostic (only @ports DebugType).

export type ReadMem = (addr: number, len: number) => Promise<Uint8Array | undefined>

export interface Resolved {
  addr: number
  type: DebugType
}

export type EvalResult = { ok: true; node: Resolved } | { ok: false; error: string }

interface Accessor {
  op: '.' | '->' | '[]'
  name?: string
  index?: number
}

// Tokenise `*`-prefixes + base ident + accessor chain. Throws on malformed.
function parse(expr: string): { stars: number; base: string; chain: Accessor[] } {
  let s = expr.trim()
  let stars = 0
  while (s.startsWith('*')) { stars++; s = s.slice(1).trimStart() }
  const baseM = /^[A-Za-z_]\w*/.exec(s)
  if (!baseM) throw new Error('expected a name')
  const base = baseM[0]
  s = s.slice(base.length)
  const chain: Accessor[] = []
  while (s.length) {
    s = s.trimStart()
    let m: RegExpExecArray | null
    if ((m = /^->\s*([A-Za-z_]\w*)/.exec(s))) { chain.push({ op: '->', name: m[1] }); s = s.slice(m[0].length) }
    else if ((m = /^\.\s*([A-Za-z_]\w*)/.exec(s))) { chain.push({ op: '.', name: m[1] }); s = s.slice(m[0].length) }
    else if ((m = /^\[\s*(\d+)\s*\]/.exec(s))) { chain.push({ op: '[]', index: Number(m[1]) }); s = s.slice(m[0].length) }
    else throw new Error(`unexpected '${s[0]}'`)
  }
  return { stars, base, chain }
}

async function deref(loc: Resolved, read: ReadMem): Promise<Resolved> {
  if (loc.type.kind !== 'pointer') throw new Error('not a pointer')
  const b = await read(loc.addr, loc.type.bytes)
  if (!b) throw new Error('read failed')
  return { addr: pointerTarget(b, loc.type), type: loc.type.to }
}

export async function evalWatch(expr: string, symbols: readonly DebugSymbol[], read: ReadMem): Promise<EvalResult> {
  try {
    const { stars, base, chain } = parse(expr)
    const sym = symbols.find((s) => s.name === base)
    if (!sym) throw new Error(`unknown symbol '${base}'`)
    let loc: Resolved = { addr: sym.location.addr, type: sym.type }

    for (const acc of chain) {
      if (acc.op === '.') {
        if (loc.type.kind !== 'struct' && loc.type.kind !== 'union') throw new Error(`'.${acc.name}' on non-struct`)
        const f = loc.type.fields.find((x) => x.name === acc.name)
        if (!f) throw new Error(`no field '${acc.name}'`)
        loc = { addr: loc.addr + f.offset, type: f.type }
      } else if (acc.op === '->') {
        const t = await deref(loc, read)
        if (t.type.kind !== 'struct' && t.type.kind !== 'union') throw new Error(`'->${acc.name}' on non-struct pointer`)
        const f = t.type.fields.find((x) => x.name === acc.name)
        if (!f) throw new Error(`no field '${acc.name}'`)
        loc = { addr: t.addr + f.offset, type: f.type }
      } else {
        const i = acc.index ?? 0
        if (loc.type.kind === 'array') loc = { addr: loc.addr + i * loc.type.elem.bytes, type: loc.type.elem }
        else if (loc.type.kind === 'pointer') { const t = await deref(loc, read); loc = { addr: t.addr + i * t.type.bytes, type: t.type } }
        else throw new Error('subscript on non-array')
      }
    }

    for (let i = 0; i < stars; i++) loc = await deref(loc, read)
    return { ok: true, node: loc }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'bad expression' }
  }
}
