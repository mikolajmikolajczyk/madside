import { describe, expect, it } from 'vitest'
import { parseDbg } from './cc65-dbg'

// Minimal cc65 dbginfo v2 sample (tab-separated keyword + key=val list).
const DBG = [
  'version\tmajor=2,minor=0',
  'file\tid=0,name="src/main.c",size=50,mtime=0x0,mod=0',
  'file\tid=1,name="runtime/foo.s",size=10,mtime=0x0,mod=1',
  'seg\tid=0,name="CODE",start=0x8000,size=0x100,addrsize=absolute,type=ro',
  'span\tid=0,seg=0,start=0,size=3',
  'span\tid=1,seg=0,start=3,size=2',
  'span\tid=2,seg=0,start=16,size=4',
  'line\tid=0,file=0,line=5,type=1,span=0+1',
  'line\tid=1,file=0,line=6,type=1,span=2',
  'line\tid=2,file=1,line=99,type=0,span=0',
  'sym\tid=0,name="_main",addrsize=absolute,scope=0,def=0,val=0x8000,seg=0,type=lab',
  'sym\tid=1,name="FOO",val=0x10,type=equ',
  // Frame info (#131): a function scope, its auto locals (offs omitted ⇒ 0),
  // a block-nested scope whose autos fold into the function, plus a static csym
  // (ignored — not a stack local) and the c_sp frame pointer.
  'scope\tid=0,name="",mod=0,size=143,span=79',
  'scope\tid=1,name="_main",mod=0,type=scope,size=27,parent=0,sym=0,span=15',
  'scope\tid=2,name="",mod=0,type=scope,size=5,parent=1,span=16',
  'csym\tid=0,name="main",scope=1,type=0,sc=static,sym=0',
  'csym\tid=1,name="a",scope=1,type=0,sc=auto,offs=2',
  'csym\tid=2,name="b",scope=1,type=0,sc=auto',
  'csym\tid=3,name="sum",scope=1,type=0,sc=auto,offs=-2',
  'csym\tid=4,name="blk",scope=2,type=0,sc=auto,offs=-4',
  'sym\tid=99,name="c_sp",addrsize=zeropage,size=2,scope=0,val=0x82,seg=0,type=lab',
].join('\n')

describe('parseDbg', () => {
  const { sourceMap, labels } = parseDbg(DBG, ['src/main.c'])

  it('keys the map by the project path (not the .dbg path)', () => {
    expect([...sourceMap.locToAddr.keys()]).toEqual(['src/main.c'])
  })

  it('maps a C line to the FIRST address of its spans (locToAddr)', () => {
    const m = sourceMap.locToAddr.get('src/main.c')!
    expect(m.get(5)).toBe(0x8000) // span 0 → seg.start + 0
    expect(m.get(6)).toBe(0x8010) // span 2 → seg.start + 16
  })

  it('records EVERY address a C line emits at (lineToAddrs)', () => {
    const m = sourceMap.lineToAddrs!.get('src/main.c')!
    expect(m.get(5)).toEqual([0x8000, 0x8003]) // spans 0 + 1
    expect(m.get(6)).toEqual([0x8010])
  })

  it('reverse-maps every address back to its source line', () => {
    expect(sourceMap.addrToLoc.get(0x8003)).toEqual({ file: 'src/main.c', line: 5 })
    expect(sourceMap.addrToLoc.get(0x8010)).toEqual({ file: 'src/main.c', line: 6 })
  })

  it('skips files outside the project (cc65 runtime library)', () => {
    expect(sourceMap.addrToLoc.has(0x8000) && sourceMap.locToAddr.size === 1).toBe(true)
    // line id=2 was in runtime/foo.s — no entry should reference it.
    for (const loc of sourceMap.addrToLoc.values()) expect(loc.file).toBe('src/main.c')
  })

  it('collects labels (type=lab) and ignores equates', () => {
    expect(labels.get('_main')).toBe(0x8000)
    expect(labels.has('FOO')).toBe(false)
    expect(labels.get('c_sp')).toBe(0x82) // frame pointer (#131)
  })

  it('extracts function frames with auto locals (#131)', () => {
    const { scopes } = parseDbg(DBG, ['src/main.c'])
    expect(scopes).toHaveLength(1)
    const fn = scopes[0]!
    expect(fn.name).toBe('_main')
    expect(fn.start).toBe(0x8000)
    expect(fn.end).toBe(0x8000 + 27)
    // a/b/sum from the function scope + blk folded up from the block scope;
    // the static csym `main` is excluded. Omitted offs ⇒ 0.
    expect(fn.locals).toEqual([
      { name: 'a', offset: 2 },
      { name: 'b', offset: 0 },
      { name: 'sum', offset: -2 },
      { name: 'blk', offset: -4 },
    ])
  })

  it('leaves flat segments without a physical placement (no bank)', () => {
    // The flat fixture above has no `bank=` on its segment, so SourceLocs stay
    // bare {file, line} — banking groundwork is invisible to flat builds.
    expect(sourceMap.addrToLoc.get(0x8000)).toEqual({ file: 'src/main.c', line: 5 })
    for (const loc of sourceMap.addrToLoc.values()) {
      expect(loc.space).toBeUndefined()
      expect(loc.offset).toBeUndefined()
    }
  })
})

// ADR-0014 Phase 0: a banked build's segment carries `bank=` (+ `ooffs`, the file
// offset). The parser captures the physical placement onto each SourceLoc —
// unused until the bank-aware debugger lands, but no longer discarded.
const BANKED_DBG = [
  'version\tmajor=2,minor=0',
  'file\tid=0,name="src/game.s",size=80,mtime=0x0,mod=0',
  // Two banked segments at distinct run addresses + a flat segment.
  'seg\tid=0,name="LOWCODE",start=0x8000,size=0x100,addrsize=absolute,type=ro,oname="game.bin",ooffs=0x10,bank=0',
  'seg\tid=1,name="HIGHCODE",start=0xa000,size=0x100,addrsize=absolute,type=ro,oname="game.bin",ooffs=0x4000,bank=3',
  'seg\tid=2,name="FIXED",start=0xc000,size=0x40,addrsize=absolute,type=ro',
  'span\tid=0,seg=0,start=4,size=2',
  'span\tid=1,seg=1,start=8,size=2',
  'span\tid=2,seg=2,start=0,size=2',
  'line\tid=0,file=0,line=10,type=1,span=0',
  'line\tid=1,file=0,line=20,type=1,span=1',
  'line\tid=2,file=0,line=30,type=1,span=2',
].join('\n')

describe('parseDbg — banked placement capture (ADR-0014 Phase 0)', () => {
  const { sourceMap } = parseDbg(BANKED_DBG, ['src/game.s'])

  it('captures bank + physical offset onto a banked line', () => {
    // line 10: bank 0, run $8004, physical offset ooffs(0x10) + span.start(4) = 0x14
    expect(sourceMap.addrToLoc.get(0x8004)).toEqual({
      file: 'src/game.s', line: 10, space: 'bank0', offset: 0x14,
    })
    // line 20: bank 3, run $a008, physical offset ooffs(0x4000) + span.start(8) = 0x4008
    expect(sourceMap.addrToLoc.get(0xa008)).toEqual({
      file: 'src/game.s', line: 20, space: 'bank3', offset: 0x4008,
    })
  })

  it('leaves a non-banked segment in the same build placement-free', () => {
    // line 30 lives in the FIXED segment (no bank=) → bare {file, line}.
    expect(sourceMap.addrToLoc.get(0xc000)).toEqual({ file: 'src/game.s', line: 30 })
  })

  it('keeps locToAddr / lineToAddrs as plain logical addresses', () => {
    // The line↔addr maps are untouched — only the addr→loc value gained the
    // placement, so nothing downstream changes until banking is wired.
    expect(sourceMap.locToAddr.get('src/game.s')!.get(10)).toBe(0x8004)
    expect(sourceMap.lineToAddrs!.get('src/game.s')!.get(20)).toEqual([0xa008])
  })
})
