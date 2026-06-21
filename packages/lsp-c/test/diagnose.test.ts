import { describe, expect, it } from 'vitest'
import { diagnoseC, indexC } from '../src/engine'

function diag(text: string, sysroot?: { path: string; text: string }[]) {
  const index = indexC([{ path: 'main.c', text }], sysroot ? { sysrootHeaders: sysroot } : {})
  return diagnoseC(index, text)
}

describe('diagnoseC — semantic diagnostics', () => {
  it('flags a bad member access on a struct', () => {
    const text = 'struct P { int x; };\nvoid f(struct P p) {\n  p.nope = 1;\n}'
    const d = diag(text)
    expect(d).toHaveLength(1)
    expect(d[0]!.severity).toBe('error')
    expect(d[0]!.message).toContain("no member named 'nope'")
    expect(text.slice(d[0]!.start, d[0]!.end)).toBe('nope')
  })

  it('flags a bad member through a pointer (->)', () => {
    const text = 'struct P { int x; };\nvoid f(struct P *p) {\n  p->bad;\n}'
    const d = diag(text)
    expect(d.map((x) => x.message)).toEqual([expect.stringContaining("no member named 'bad'")])
  })

  it('flags a bad member on a cc65 register macro', () => {
    const text =
      'struct __vic2 { unsigned char bordercolor; };\n' +
      '#define VIC (*(struct __vic2 *)0xd000)\n' +
      'void f(void) { VIC.nosuchfield = 0; }'
    const d = diag(text)
    expect(d).toHaveLength(1)
    expect(d[0]!.message).toContain("no member named 'nosuchfield'")
  })

  it('flags an unknown struct tag used by value', () => {
    const text = 'void f(void) {\n  struct Nope q;\n}'
    const d = diag(text)
    expect(d).toHaveLength(1)
    expect(d[0]!.message).toContain("unknown struct 'Nope'")
  })

  // ——— zero false positives on valid code ———

  it('no diagnostics for valid member access (incl. nested + register)', () => {
    const text =
      'struct Inner { int v; };\n' +
      'struct Outer { struct Inner in; };\n' +
      'struct __vic2 { unsigned char bordercolor; };\n' +
      '#define VIC (*(struct __vic2 *)0xd000)\n' +
      'void f(struct Outer *o) {\n' +
      '  o->in.v = 1;\n' +
      '  VIC.bordercolor = 2;\n' +
      '}'
    expect(diag(text)).toEqual([])
  })

  it('does not flag a forward-declared / opaque-pointer tag', () => {
    const text = 'struct Opaque;\nvoid f(struct Opaque *p);\nstruct Other *g(void);'
    expect(diag(text)).toEqual([])
  })

  it('does not flag members on an unresolved receiver (no false positive)', () => {
    // `thing` has no visible declaration — we cannot resolve it, so we stay quiet.
    const text = 'void f(void) {\n  thing.whatever = 1;\n}'
    expect(diag(text)).toEqual([])
  })

  it('resolves struct tags from sysroot headers (no false positive)', () => {
    const sysroot = [{ path: 'vic.h', text: 'struct __vic2 { unsigned char bordercolor; };' }]
    const text = '#include <vic.h>\nvoid f(struct __vic2 *v) { v->bordercolor = 1; }'
    expect(diag(text, sysroot)).toEqual([])
  })
})
