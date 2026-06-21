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
  })
})
