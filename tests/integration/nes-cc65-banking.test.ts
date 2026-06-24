// NES banked SOURCE MAP proof (ADR-0014 Phase 2 step 5, #134). Runs the real
// ca65 + ld65 (cc65) over a banked linker config — two code segments at the same
// $8000 in PRG banks 0 and 1 — and checks the debug-info chain: ld65 emits
// `bank=` on the segments (only when a MEMORY area carries a `bank` attribute),
// the cc65 .dbg parser captures both into `bankedAddrToLoc`, and a source-line
// breakpoint resolves to a bank-qualified BankBreakpoint. That closes the
// editor-side half of NES banking: set a breakpoint on a banked source line and
// it knows its bank, the same way the live jsnes backend reports the live bank.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { WASI, File, OpenFile, ConsoleStdout, PreopenDirectory } from '@bjorn3/browser_wasi_shim'
import { parseDbg } from '@madside/toolchain-ca65'
import { resolveBreakpoints } from '@ui/hooks'

const repo = (p: string) => fileURLToPath(new URL('../../' + p, import.meta.url))
const CC65 = (w: string) => repo(`packages/wasm-cc65/${w}`)

// Banked UNROM-style cc65 config: three PRG banks, each a MEMORY area carrying a
// `bank` attribute (that attribute is what makes ld65 emit `bank=` in the .dbg).
const CFG = `MEMORY {
  ZP:     start=$00,   size=$100,  type=rw;
  HEADER: start=$0,    size=$10,   type=ro, file=%O, fill=yes;
  PRG0:   start=$8000, size=$4000, type=ro, file=%O, fill=yes, bank=0;
  PRG1:   start=$8000, size=$4000, type=ro, file=%O, fill=yes, bank=1;
  PRGF:   start=$c000, size=$4000, type=ro, file=%O, fill=yes, bank=2;
}
SEGMENTS {
  HEADER:  load=HEADER, type=ro;
  CODE0:   load=PRG0,   type=ro, optional=yes;
  CODE1:   load=PRG1,   type=ro, optional=yes;
  CODEF:   load=PRGF,   type=ro;
  VECTORS: load=PRGF,   type=ro, start=$fffa;
}
`

// b0entry (CODE0 → bank 0) and b1entry (CODE1 → bank 1) both assemble to $8000.
const ASM = `.segment "HEADER"
  .byte "NES", $1a
  .byte 3, 0, $20, 0
  .byte 0,0,0,0,0,0,0,0
.segment "CODE0"
b0entry:  jmp $c010
.segment "CODE1"
b1entry:  jmp $8000
.segment "CODEF"
reset:
  sei
  cld
  ldx #$ff
  txs
  lda #0
  sta $8000
  jmp $8000
nmi: rti
irq: rti
.segment "VECTORS"
  .word nmi
  .word reset
  .word irq
`

async function runWasi(wasmPath: string, args: string[], files: Map<string, File>): Promise<number> {
  const dir = new PreopenDirectory('.', files)
  const wasi = new WASI(args, [], [
    new OpenFile(new File([])),
    ConsoleStdout.lineBuffered(() => {}),
    ConsoleStdout.lineBuffered(() => {}),
    dir,
  ])
  const mod = new WebAssembly.Module(await readFile(wasmPath))
  const inst = new WebAssembly.Instance(mod, { wasi_snapshot_preview1: wasi.wasiImport })
  try {
    wasi.start(inst as unknown as { exports: { memory: WebAssembly.Memory; _start: () => unknown } })
  } catch (e) {
    return typeof e === 'object' && e && 'code' in e ? (e as { code: number }).code : 1
  }
  return 0
}

describe('NES banked source map from real cc65 (ADR-0014 Phase 2)', () => {
  it('captures same-$8000 lines in different banks and resolves a bank breakpoint', async () => {
    const enc = new TextEncoder()
    const files = new Map<string, File>([
      ['prog.s', new File(enc.encode(ASM))],
      ['banked.cfg', new File(enc.encode(CFG))],
      ['prog.o', new File([])],
      ['prog.nes', new File([])],
      ['prog.dbg', new File([])],
    ])

    expect(await runWasi(CC65('ca65.wasm'), ['ca65', '-g', 'prog.s', '-o', 'prog.o'], files)).toBe(0)
    expect(await runWasi(CC65('ld65.wasm'),
      ['ld65', '-C', 'banked.cfg', '--dbgfile', 'prog.dbg', '-o', 'prog.nes', 'prog.o'], files)).toBe(0)

    const dbg = new TextDecoder().decode(files.get('prog.dbg')!.data)
    const { sourceMap } = parseDbg(dbg, ['prog.s'])

    // ld65 emitted bank= on the two $8000 segments → both captured, keyed by
    // their physical offset (ooffs + span.start).
    const at8000 = sourceMap.bankedAddrToLoc?.get(0x8000)
    expect(at8000).toBeDefined()
    const banks = at8000!.map((l) => l.space).sort()
    expect(banks).toEqual(['bank0', 'bank1'])

    // A breakpoint on the bank-1 source line resolves to a bank-qualified
    // BankBreakpoint — the editor-side input the live bankMap() match consumes.
    const b1 = at8000!.find((l) => l.space === 'bank1')!
    const bps = [...resolveBreakpoints(sourceMap, new Map([[b1.file, new Set([b1.line])]]))]
    expect(bps).toContainEqual({ addr: 0x8000, space: 'bank1' })
    // The bank-0 line at the same address resolves to bank0, not bank1.
    const b0 = at8000!.find((l) => l.space === 'bank0')!
    const bps0 = [...resolveBreakpoints(sourceMap, new Map([[b0.file, new Set([b0.line])]]))]
    expect(bps0).toContainEqual({ addr: 0x8000, space: 'bank0' })
  })
})
