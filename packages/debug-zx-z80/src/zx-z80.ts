// DebugAdapter plugin for the ZX Spectrum Z80 (chips backend). The 6502 adapter
// doesn't apply — the Z80 is a different ISA — so this exposes the Z80 register/
// flag layout and reads the backend's CpuZ80State. step/breakpoints/memory are
// CPU-agnostic and forward to the RunBackend 1:1, same as the 6502 adapter.

import type { CpuZ80State, DebugAdapterPlugin, DebugTarget, RunBackend } from '@ports'
import { Z80_FLAGS, Z80_REGISTERS } from './z80'

const attach = (backend: RunBackend): DebugTarget => ({
  registers: Z80_REGISTERS,
  flags: Z80_FLAGS,

  // Forward the live bank projection when the backend exposes one (ADR-0014) —
  // the zx128 backend does (the $7FFD-paged $C000 window); the 48K backend
  // doesn't, so this is undefined and the UI treats 48K as unbanked.
  bankMap: backend.bankMap ? () => backend.bankMap!() : undefined,

  async readRegisters() {
    const cpu = backend.cpuState() as CpuZ80State
    return {
      pc: cpu.pc, sp: cpu.sp,
      af: cpu.af, bc: cpu.bc, de: cpu.de, hl: cpu.hl,
      ix: cpu.ix, iy: cpu.iy, ir: cpu.ir,
      af2: cpu.af2, bc2: cpu.bc2, de2: cpu.de2, hl2: cpu.hl2,
      im: cpu.im,
    }
  },

  async readFlags() {
    const cpu = backend.cpuState() as CpuZ80State
    return { ...cpu.flags }
  },

  async step() {
    backend.step()
    return backend.getPC()
  },

  async stepFrame() {
    backend.advanceFrame()
    return backend.getPC()
  },

  setBreakpoints(addrs) {
    backend.setBreakpoints(addrs)
  },

  async readMemory(addr, len, space) {
    return backend.readMem(space && space !== 'cpu' ? addr : addr & 0xffff, len, space)
  },

  async writeMemory() {
    throw new Error('writeMemory not supported by zx-z80 adapter')
  },

  getPC() {
    return backend.getPC()
  },

  isAtInstrBoundary() {
    return backend.isAtInstrBoundary()
  },
})

export const zxZ80DebugAdapter: DebugAdapterPlugin = {
  kind: 'debug-adapter',
  id: 'zx-z80-debug',
  name: 'ZX Spectrum Z80 (chips)',
  attach,
}
