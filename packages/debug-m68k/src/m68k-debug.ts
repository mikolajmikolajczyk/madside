// DebugAdapter plugin for the Motorola 68000 (Genesis gpgx backend, #145).
// Neither the 6502 nor the Z80 adapter applies — the 68000 is a 32-bit ISA with
// its own register file — so this exposes the m68k layout and reads the backend's
// Cpu68kState. step/breakpoints/memory are CPU-agnostic and forward 1:1, but at
// NATIVE 24-bit width (no 16-bit address mask — #133/88A).

import type { Cpu68kState, DebugAdapterPlugin, DebugTarget, RunBackend } from '@ports'
import { M68K_FLAGS, M68K_REGISTERS } from './m68k'

const attach = (backend: RunBackend): DebugTarget => ({
  registers: M68K_REGISTERS,
  flags: M68K_FLAGS,

  async readRegisters() {
    const cpu = backend.cpuState() as Cpu68kState
    const out: Record<string, number> = { pc: cpu.pc, sr: cpu.sr }
    for (let i = 0; i < 8; i++) out[`d${i}`] = cpu.d[i] ?? 0
    for (let i = 0; i < 8; i++) out[`a${i}`] = cpu.a[i] ?? 0
    return out
  },

  async readFlags() {
    const { sr } = backend.cpuState() as Cpu68kState
    return {
      c: (sr & 0x01) !== 0,
      v: (sr & 0x02) !== 0,
      z: (sr & 0x04) !== 0,
      n: (sr & 0x08) !== 0,
      x: (sr & 0x10) !== 0,
    }
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
    // Native 24-bit address — no 16-bit mask (#133).
    return backend.readMem(addr, len, space)
  },

  async writeMemory() {
    // Read-only debug for Phase A (the RunBackend exposes no memory write); a
    // write_byte export + a richer backend handle land with the VDP work.
    throw new Error('writeMemory not supported by m68k-debug yet')
  },

  getPC() {
    return backend.getPC()
  },

  isAtInstrBoundary() {
    return backend.isAtInstrBoundary()
  },
})

export const m68kDebugAdapter: DebugAdapterPlugin = {
  kind: 'debug-adapter',
  id: 'm68k-debug',
  name: 'Motorola 68000 (Genesis)',
  attach,
}
