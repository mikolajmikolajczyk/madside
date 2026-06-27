// sccz80 frame-local DebugInfo from the real z88dk C chain (#136). With
// `-frameix -debug-defc`, sccz80 makes IX a true frame pointer and emits cdb
// frame records; buildZ88dkDebugInfo turns them into per-function scopes with
// IX-relative, typed locals — the reliable locals path the Variables panel
// consumes (cc65 can't, ADR-0012). Runs the full chain and checks the scope.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z88dkToolchain } from '@madside/toolchain-z88dk'

const repo = (p: string) => fileURLToPath(new URL('../../' + p, import.meta.url))
const WASM = (n: string) => repo(`packages/wasm-z88dk/${n}`)
const ZIP = repo('packages/toolchain-z88dk/src/zx-sysroot.zip')

const MAIN_C = [
  'int add(int a, int b) {',
  '  int sum = a + b;',
  '  int doubled = sum * 2;',
  '  return doubled;',
  '}',
  'int main() {',
  '  int r = add(3, 4);',
  '  return r;',
  '}',
].join('\n')

describe('ZX C frame locals from the real z88dk chain (#136)', () => {
  let original: typeof globalThis.fetch | undefined
  beforeAll(() => {
    original = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const m = url.match(/([\w-]+\.wasm)/)
      if (m) return new Response(await readFile(WASM(m[1])), { status: 200, headers: { 'content-type': 'application/wasm' } })
      if (url.includes('zx-sysroot')) return new Response(await readFile(ZIP), { status: 200, headers: { 'content-type': 'application/zip' } })
      if (original) return original(input)
      throw new Error(`unmocked fetch: ${url}`)
    }) as typeof globalThis.fetch
  })
  afterAll(() => { if (original) globalThis.fetch = original })

  it('emits typed IX-frame scopes for each function', async () => {
    const r = await z88dkToolchain.build({
      projectId: 'zx-c-locals',
      machine: 'zx-spectrum',
      main: 'src/main.c',
      files: [{ path: 'src/main.c', content: MAIN_C }],
      options: {},
    })
    expect(r.ok, `build failed: ${r.stderr}`).toBe(true)
    const scopes = r.debugInfo?.scopes
    expect(scopes, 'no scopes').toBeDefined()

    const add = scopes!.find((s) => s.name === 'add')
    expect(add, 'no add scope').toBeDefined()
    // sccz80 -frameix → IX frame pointer.
    expect(add!.frame).toEqual({ kind: 'reg', reg: 'ix' })
    // Scope spans from add()'s entry; main() comes after.
    expect(add!.pc.start).toBe(r.labels!.get('_add'))
    expect(add!.pc.end).toBe(r.labels!.get('_main'))

    const off = (n: string) => add!.locals.find((l) => l.name === n)?.offset
    expect(off('a')).toBe(6)  // params above the frame
    expect(off('b')).toBe(4)
    expect(off('sum')).toBe(-2) // locals below
    expect(off('doubled')).toBe(-4)
    // All four are plain ints (2 bytes, signed, little-endian).
    for (const n of ['a', 'b', 'sum', 'doubled']) {
      expect(add!.locals.find((l) => l.name === n)!.type).toMatchObject({ kind: 'scalar', bytes: 2, endian: 'le' })
    }
  }, 120_000)
})
