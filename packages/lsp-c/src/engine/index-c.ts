import type { SyntaxNode } from '@lezer/common'
import type {
  CField,
  CIndex,
  CLocation,
  CSymbol,
  CType,
  IndexOptions,
  SourceFile,
} from './types'
import { preprocess, type PreprocessResult } from './preprocess'
import { parseC, stripDecorators } from './parse'
import { declTypeName, declaredIds, deepChild, slice, walk } from './ast'

// Build a project index from source files by walking each file's Lezer tree:
// the type table (struct / union / typedef → fields) and the top-level symbol
// table (functions / macros / globals). cc65 sysroot headers are indexed
// read-only so register structs resolve. The var→type resolution that drives
// member completion is done per-request in completeAt (from the live buffer, so
// locals + unsaved edits resolve), not stored here.

const basename = (path: string): string => path.split('/').pop() ?? path

// A cc65 register-macro body's pointer cast: `(struct __vic2*)` / `(union x *)`.
// The captured tag is the struct/union the macro instance has.
const REGISTER_CAST = /\(\s*(?:struct|union)\s+(\w+)\s*\*\s*\)/

/** A FieldDeclaration's type, as written: the type specifier text plus a `*`
 *  per pointer level. Used both as the completion detail and to resolve nested
 *  `a.b.c` member chains. */
function fieldType(decl: SyntaxNode, text: string): string {
  const typeNode =
    decl.getChild('PrimitiveType') ??
    decl.getChild('SizedTypeSpecifier') ??
    decl.getChild('TypeIdentifier') ??
    decl.getChild('StructSpecifier') ??
    decl.getChild('UnionSpecifier')
  let type = typeNode ? slice(text, typeNode).replace(/\s+/g, ' ').trim() : ''
  if (deepChild(decl, 'PointerDeclarator')) type += ' *'
  return type
}

const locOf = (uri: string, n: SyntaxNode): CLocation => ({ uri, start: n.from, end: n.to })

function fieldsOf(list: SyntaxNode, text: string, uri: string): CField[] {
  const out: CField[] = []
  for (let decl = list.firstChild; decl; decl = decl.nextSibling) {
    if (decl.name !== 'FieldDeclaration') continue
    const id = deepChild(decl, 'FieldIdentifier')
    if (!id) continue
    out.push({ name: slice(text, id), type: fieldType(decl, text), loc: locOf(uri, id) })
  }
  return out
}

/** Enumerators of an `enum X { … }`, each carried as a field whose "type" is the
 *  enum name (so hover can name the enum). */
function enumeratorsOf(list: SyntaxNode, text: string, enumName: string, uri: string): CField[] {
  const out: CField[] = []
  for (let e = list.firstChild; e; e = e.nextSibling) {
    if (e.name !== 'Enumerator') continue
    const id = e.getChild('Identifier')
    if (id) out.push({ name: slice(text, id), type: `enum ${enumName}`, loc: locOf(uri, id) })
  }
  return out
}

function collectTypes(
  text: string,
  file: string,
  uri: string,
  into: Map<string, CType>,
  aliasInto: Map<string, string>,
  decorators?: RegExp,
): void {
  const root = parseC(text, decorators).topNode
  walk(root, (n) => {
    // Named definition: `struct Foo { … }` / `union U { … }`.
    if (n.name === 'StructSpecifier' || n.name === 'UnionSpecifier') {
      const list = n.getChild('FieldDeclarationList')
      const tag = n.getChild('TypeIdentifier')
      if (list && tag) {
        const name = slice(text, tag)
        if (!into.has(name)) {
          into.set(name, {
            name,
            kind: n.name === 'UnionSpecifier' ? 'union' : 'struct',
            fields: fieldsOf(list, text, uri),
            file,
            loc: locOf(uri, tag),
          })
        }
      }
      return
    }
    // `enum Color { RED, GREEN };` — the type, keyed by tag.
    if (n.name === 'EnumSpecifier') {
      const list = n.getChild('EnumeratorList')
      const tag = n.getChild('TypeIdentifier')
      if (list && tag) {
        const name = slice(text, tag)
        if (!into.has(name)) {
          into.set(name, {
            name,
            kind: 'enum',
            fields: enumeratorsOf(list, text, name, uri),
            file,
            loc: locOf(uri, tag),
          })
        }
      }
      return
    }
    if (n.name === 'TypeDefinition') {
      // `typedef struct { … } Bar;` — inline definition, alias carries the fields.
      const list = deepChild(n, 'FieldDeclarationList')
      const ids = n.getChildren('TypeIdentifier')
      if (list) {
        const alias = ids[ids.length - 1]
        if (alias) {
          const name = slice(text, alias)
          if (!into.has(name)) {
            into.set(name, {
              name,
              kind: 'typedef',
              fields: fieldsOf(list, text, uri),
              file,
              loc: locOf(uri, alias),
            })
          }
        }
        return
      }
      // Non-inline alias: `typedef struct S *SP;` / `typedef struct S SP;` /
      // `typedef Foo Bar;` — record `alias → underlying` so member resolution
      // can follow it to the real struct.
      const spec = n.getChild('StructSpecifier') ?? n.getChild('UnionSpecifier')
      const directIds = ids.map((id) => slice(text, id))
      const specTag = spec?.getChild('TypeIdentifier')
      const underlying = specTag ? slice(text, specTag) : directIds[0]
      const ptr = n.getChild('PointerDeclarator')
      let alias: string | undefined
      if (ptr) {
        const a = deepChild(ptr, 'TypeIdentifier') ?? deepChild(ptr, 'Identifier')
        alias = a ? slice(text, a) : undefined
      } else {
        alias = spec ? directIds[directIds.length - 1] : directIds[1]
      }
      if (alias && underlying && alias !== underlying && !aliasInto.has(alias)) {
        aliasInto.set(alias, underlying)
      }
    }
  })
}

/** A one-line signature for completion detail. For a prototype (`Declaration`
 *  with a `FunctionDeclarator`) it's the whole declaration minus the trailing
 *  `;`; for a `FunctionDefinition` it's the text up to the body. Whitespace is
 *  collapsed so it reads on one line. */
function signatureOf(decl: SyntaxNode, text: string, decorators?: RegExp): string {
  const body = decl.getChild('CompoundStatement')
  const end = body ? body.from : decl.to
  // Blank dialect calling-convention decorators so the signature reads cleanly
  // (`void __fastcall__ cputs(...)` → `void cputs(...)`).
  return stripDecorators(text.slice(decl.from, end), decorators)
    .replace(/\s+/g, ' ')
    .replace(/\s*;\s*$/, '')
    .trim()
}

/** The function name node from a `FunctionDeclarator`. */
function fnNameNode(declarator: SyntaxNode): SyntaxNode | null {
  return declarator.getChild('Identifier')
}

/** Each parameter of a `FunctionDeclarator`, as written (whitespace collapsed),
 *  for signature help. A lone `void` parameter list is normalised to `[]`. */
function paramsOf(declarator: SyntaxNode, text: string): string[] {
  const list = declarator.getChild('ParameterList')
  if (!list) return []
  const out: string[] = []
  for (let p = list.firstChild; p; p = p.nextSibling) {
    if (p.name !== 'ParameterDeclaration') continue
    out.push(slice(text, p).replace(/\s+/g, ' ').trim())
  }
  return out.length === 1 && out[0] === 'void' ? [] : out
}

function collectSymbols(
  text: string,
  file: string,
  uri: string,
  into: Map<string, CSymbol>,
  header?: string,
  decorators?: RegExp,
): void {
  const root = parseC(text, decorators).topNode
  const hdr = header ? { header } : {}
  const add = (s: CSymbol): void => {
    if (!into.has(s.label)) into.set(s.label, s)
  }

  // `#define NAME …`. cc65 exposes hardware registers as `#define VIC
  // (*(struct __vic2*)0xd000)` — index those as a typed global so `VIC.`
  // resolves to the struct's fields; everything else is a plain macro.
  walk(root, (n) => {
    if (n.name !== 'PreprocDirective') return
    if (!n.getChild('#define')) return
    const id = n.getChild('Identifier')
    if (!id) return
    const label = slice(text, id)
    const loc = locOf(uri, id)
    const arg = n.getChild('PreprocArg')
    const tag = arg ? REGISTER_CAST.exec(slice(text, arg))?.[1] : undefined
    if (tag) add({ label, kind: 'global', type: tag, detail: `struct ${tag}`, file, loc, ...hdr })
    else add({ label, kind: 'macro', file, loc, ...hdr })
  })

  // Enum constants — completable identifiers (rendered as constants), tagged
  // with their enum for hover provenance.
  walk(root, (n) => {
    if (n.name !== 'EnumSpecifier') return
    const list = n.getChild('EnumeratorList')
    const tag = n.getChild('TypeIdentifier')
    if (!list) return
    const enumName = tag ? slice(text, tag) : ''
    for (let e = list.firstChild; e; e = e.nextSibling) {
      if (e.name !== 'Enumerator') continue
      const id = e.getChild('Identifier')
      if (id) {
        add({
          label: slice(text, id),
          kind: 'macro',
          file,
          loc: locOf(uri, id),
          ...(enumName ? { detail: `enum ${enumName}` } : {}),
          ...hdr,
        })
      }
    }
  })

  // Top-level functions + globals (direct children of the program root only, so
  // locals inside function bodies don't leak into identifier completion).
  for (let n = root.firstChild; n; n = n.nextSibling) {
    if (n.name === 'FunctionDefinition') {
      const decl = n.getChild('FunctionDeclarator')
      const id = decl ? fnNameNode(decl) : null
      if (id && decl) {
        add({
          label: slice(text, id),
          kind: 'function',
          file,
          detail: signatureOf(n, text, decorators),
          params: paramsOf(decl, text),
          loc: locOf(uri, id),
          ...hdr,
        })
      }
      continue
    }
    if (n.name !== 'Declaration') continue
    const fnDecl = n.getChild('FunctionDeclarator')
    if (fnDecl) {
      const id = fnNameNode(fnDecl)
      if (id) {
        add({
          label: slice(text, id),
          kind: 'function',
          file,
          detail: signatureOf(n, text, decorators),
          params: paramsOf(fnDecl, text),
          loc: locOf(uri, id),
          ...hdr,
        })
      }
      continue
    }
    // Every declarator of the declaration (`struct Foo a, b;` → a and b).
    const type = declTypeName(n, text)
    for (const id of declaredIds(n, text)) {
      const loc: CLocation = { uri, start: id.from, end: id.to }
      add({ label: id.name, kind: 'global', file, loc, ...(type ? { type } : {}), ...hdr })
    }
  }
}

export function indexC(files: SourceFile[], opts: IndexOptions = {}): CIndex {
  const index: CIndex = { types: new Map(), symbols: new Map(), aliases: new Map() }
  const sysroot = opts.sysrootHeaders ?? []
  const decorators = opts.decorators

  // Legacy path (#30): no target defines → index every sysroot header flat, no
  // preprocessor. Kept for back-compat with hosts that don't pass `defines`.
  if (opts.defines === undefined) {
    // Sysroot headers carry their basename as the declaring header (drives the
    // editor's auto-`#include`); project `.c`/`.h` symbols don't get one.
    for (const f of sysroot) {
      const file = basename(f.path)
      collectTypes(f.text, file, f.path, index.types, index.aliases, decorators)
      collectSymbols(f.text, file, f.path, index.symbols, file, decorators)
    }
    for (const f of files) {
      const file = basename(f.path)
      collectTypes(f.text, file, f.path, index.types, index.aliases, decorators)
      collectSymbols(f.text, file, f.path, index.symbols, undefined, decorators)
    }
    return index
  }

  // Preprocessor-aware path (#30): evaluate `#if defined(...)` so the per-target
  // `<target.h>` gating resolves, and drop headers reachable only through
  // inactive conditional `#include`s (other targets' platform headers, e.g.
  // agat.h on a C64 build). Generic headers + the active target's headers stay,
  // so completion + auto-`#include` keep working without the cross-target noise.
  const defines = opts.defines
  const byName = new Map<string, { src: SourceFile; pp: PreprocessResult }>()
  for (const h of sysroot) byName.set(basename(h.path), { src: h, pp: preprocess(h.text, defines) })
  const ppProj = files.map((f) => ({ src: f, pp: preprocess(f.text, defines) }))

  // A header included anywhere through an *inactive* conditional `#include` is a
  // candidate other-target header (e.g. agat.h / apple2.h on a C64 build). It
  // is kept only if some *reachable* header reaches it through an active include
  // — hence a reachability walk, not a flat tally: an excluded header's own
  // includes (agat.h unconditionally pulls apple2.h) must not rescue it.
  const inactiveSet = new Set<string>()
  for (const { pp } of [...byName.values(), ...ppProj]) {
    for (const inc of pp.includes) if (!inc.active) inactiveSet.add(basename(inc.name))
  }

  // Reach = project files + every sysroot header NOT gated out by an inactive
  // conditional, then follow active `#include`s. Other-target headers (in
  // inactiveSet, not actively reached) fall out; generic + active-target headers
  // stay, so completion + auto-`#include` keep working.
  const reached = new Set<string>()
  const queue: PreprocessResult[] = ppProj.map((e) => e.pp)
  for (const [name, e] of byName) {
    if (!inactiveSet.has(name)) {
      reached.add(name)
      queue.push(e.pp)
    }
  }
  // for-of over a growing array keeps visiting appended entries → a BFS.
  for (const pp of queue) {
    for (const inc of pp.includes) {
      if (!inc.active) continue
      const name = basename(inc.name)
      if (reached.has(name)) continue
      const target = byName.get(name)
      if (!target) continue
      reached.add(name)
      queue.push(target.pp)
    }
  }

  for (const [name, e] of byName) {
    if (!reached.has(name)) continue
    collectTypes(e.pp.stripped, name, e.src.path, index.types, index.aliases, decorators)
    collectSymbols(e.pp.stripped, name, e.src.path, index.symbols, name, decorators)
  }
  for (const { src, pp } of ppProj) {
    const file = basename(src.path)
    collectTypes(pp.stripped, file, src.path, index.types, index.aliases, decorators)
    collectSymbols(pp.stripped, file, src.path, index.symbols, undefined, decorators)
  }
  return index
}
