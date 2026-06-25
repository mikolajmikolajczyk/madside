// Instruction-granular 68000 breakpoints in genesis-gpgx.wasm (#146). gpgx is
// frame-scheduled, so a frame-boundary PC check almost never lands on a
// breakpoint. The wasm now carries a per-instruction check in the m68k_run loop
// (md_bp_check, injected by build-genesis-gpgx.sh) that stops the CPU with PC
// exactly at the breakpoint. This drives a tiny ROM with a tight loop, sets a
// breakpoint inside it, and proves the frame traps there (and resumes).

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const WASM = fileURLToPath(new URL('../../packages/wasm-genesis-gpgx/genesis-gpgx.wasm', import.meta.url))

const M68K_REG_D0 = 0
const M68K_REG_PC = 16

interface Core {
  memory: WebAssembly.Memory
  _initialize?: () => void
  init(): void
  rom_ptr(): number
  load_rom_buffer(len: number): number
  run_frame(): number
  step(): number
  get_reg(r: number): number
  bp_ptr(): number
  bp_capacity(): number
  set_bp_count(n: number): void
}

async function loadCore(): Promise<Core> {
  const mod = await WebAssembly.compile(await readFile(WASM))
  const WASI_EBADF = 8
  const fn = (name: string): (...a: number[]) => number => {
    if (name === 'proc_exit') return () => { throw new Error('wasi proc_exit') }
    if (name === 'fd_prestat_get' || name === 'fd_prestat_dir_name') return () => WASI_EBADF
    return () => 0
  }
  const imports: Record<string, Record<string, unknown>> = {}
  for (const imp of WebAssembly.Module.imports(mod)) {
    ;(imports[imp.module] ??= {})[imp.name] =
      imp.kind === 'function' ? fn(imp.name)
        : imp.kind === 'memory' ? new WebAssembly.Memory({ initial: 512 })
          : imp.kind === 'global' ? new WebAssembly.Global({ value: 'i32', mutable: true }, 0)
            : 0
  }
  const { exports } = await WebAssembly.instantiate(mod, imports as WebAssembly.Imports)
  const core = exports as unknown as Core
  core._initialize?.()
  return core
}

// Minimal MD ROM: move.l #$12345678,d0 at $200, then a tight loop at $206:
//   $206  addq.l #1,d0   (5281)
//   $208  bra.s  $206    (60FC)
function buildRom(): Uint8Array {
  const rom = new Uint8Array(0x400)
  const be32 = (off: number, v: number) => { rom[off] = v >>> 24; rom[off + 1] = v >>> 16; rom[off + 2] = v >>> 8; rom[off + 3] = v }
  be32(0x000, 0x00fffffe)              // initial SSP
  be32(0x004, 0x00000200)              // reset PC -> $200
  for (let i = 0; i < 16; i++) rom[0x100 + i] = 'SEGA GENESIS    '.charCodeAt(i)
  rom.set([0x20, 0x3c, 0x12, 0x34, 0x56, 0x78], 0x200) // move.l #$12345678,d0
  rom.set([0x52, 0x80], 0x206)                          // addq.l #1,d0
  rom.set([0x60, 0xfc], 0x208)                          // bra.s  $206
  return rom
}

function load(core: Core): void {
  core.init()
  new Uint8Array(core.memory.buffer).set(buildRom(), core.rom_ptr())
  expect(core.load_rom_buffer(0x400)).toBe(1)
  expect(core.get_reg(M68K_REG_PC) >>> 0).toBe(0x200)
}

function setBreakpoint(core: Core, addr: number): void {
  const view = new Uint32Array(core.memory.buffer, core.bp_ptr(), core.bp_capacity())
  view[0] = addr >>> 0
  core.set_bp_count(1)
}

describe('genesis-gpgx 68000 breakpoints (#146)', () => {
  it('traps mid-frame with PC exactly at the breakpoint', async () => {
    const core = await loadCore()
    load(core)
    setBreakpoint(core, 0x206) // the addq inside the loop

    const completed = core.run_frame()
    expect(completed).toBe(0) // 0 = trapped
    expect(core.get_reg(M68K_REG_PC) >>> 0).toBe(0x206)
    // The breakpoint instruction has NOT executed yet: move.l ran, addq did not.
    expect(core.get_reg(M68K_REG_D0) >>> 0).toBe(0x12345678)
  })

  it('resumes past the breakpoint and re-traps on the next loop iteration', async () => {
    const core = await loadCore()
    load(core)
    setBreakpoint(core, 0x206)

    expect(core.run_frame()).toBe(0)
    expect(core.get_reg(M68K_REG_D0) >>> 0).toBe(0x12345678)

    // Resume: the parked instruction runs once (addq -> D0+1), the loop branches
    // back to $206, and we trap again.
    expect(core.run_frame()).toBe(0)
    expect(core.get_reg(M68K_REG_PC) >>> 0).toBe(0x206)
    expect(core.get_reg(M68K_REG_D0) >>> 0).toBe(0x12345679)
  })

  it('traps on a breakpoint at the entry point on the very first frame', async () => {
    // Regression: a breakpoint on the reset/entry PC was skipped on the first run
    // (mistaken for resuming past a parked breakpoint) instead of trapping.
    const core = await loadCore()
    load(core)
    setBreakpoint(core, 0x200) // the entry instruction (move.l), reset PC

    expect(core.run_frame()).toBe(0) // traps immediately, before executing it
    expect(core.get_reg(M68K_REG_PC) >>> 0).toBe(0x200)
    expect(core.get_reg(M68K_REG_D0) >>> 0).toBe(0) // move.l has NOT run yet

    // Resume steps past the entry breakpoint; with no other breakpoint the loop
    // runs free, so move.l has run (D0 >= its immediate) and the loop advanced it.
    core.run_frame()
    expect(core.get_reg(M68K_REG_D0) >>> 0).toBeGreaterThanOrEqual(0x12345678)
  })

  it('single-steps one 68000 instruction at a time (not a whole frame)', async () => {
    // Regression: step() advanced a whole frame, blowing past everything to the
    // idle loop. It now executes exactly one instruction.
    const core = await loadCore()
    load(core)
    expect(core.get_reg(M68K_REG_PC) >>> 0).toBe(0x200)

    core.step() // move.l #imm,d0
    expect(core.get_reg(M68K_REG_PC) >>> 0).toBe(0x206)
    expect(core.get_reg(M68K_REG_D0) >>> 0).toBe(0x12345678)

    core.step() // addq.l #1,d0
    expect(core.get_reg(M68K_REG_PC) >>> 0).toBe(0x208)
    expect(core.get_reg(M68K_REG_D0) >>> 0).toBe(0x12345679)
  })

  it('runs the full frame once the breakpoint is cleared', async () => {
    const core = await loadCore()
    load(core)
    setBreakpoint(core, 0x206)
    expect(core.run_frame()).toBe(0)

    core.set_bp_count(0) // clear
    expect(core.run_frame()).toBe(1) // completes the frame
    // The loop spun for a whole frame, so D0 advanced well past the trap value.
    expect(core.get_reg(M68K_REG_D0) >>> 0).toBeGreaterThan(0x12345679)
  })
})
