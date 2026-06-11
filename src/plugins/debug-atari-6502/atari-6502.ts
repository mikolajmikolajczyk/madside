// DebugAdapter plugin for the Atari 6502 (Altirra backend). Exposes the
// generic MOS 6502 register/flag layout so the debugger panel renders
// identically across any 6502 machine (NES reuses MOS6502_* + a tiny adapter
// against its own backend).

import type { DebugAdapterPlugin, DebugTarget, RunBackend } from '@ports'
import { MOS6502_FLAGS, MOS6502_REGISTERS } from './mos6502'

interface Altirra6502CpuState {
  a: number
  x: number
  y: number
  pc: number
  sp: number
  flags: { n: boolean; v: boolean; b: boolean; d: boolean; i: boolean; z: boolean; c: boolean }
}

const attach = (backend: RunBackend): DebugTarget => ({
  registers: MOS6502_REGISTERS,
  flags: MOS6502_FLAGS,

  async readRegisters() {
    const cpu = backend.cpuState() as Altirra6502CpuState
    return { a: cpu.a, x: cpu.x, y: cpu.y, pc: cpu.pc, sp: cpu.sp }
  },

  async readFlags() {
    const cpu = backend.cpuState() as Altirra6502CpuState
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

  async readMemory(addr, len) {
    return backend.readMem(addr & 0xffff, len)
  },

  async writeMemory() {
    // RunBackend doesn't expose writeMem today — Altirra's editing path lives
    // behind the snapshot/restore facade. When the debugger UI grows a memory
    // editor, surface writeMem through @ports and wire it here.
    throw new Error('writeMemory not supported by atari-6502 adapter')
  },

  getPC() {
    return backend.getPC()
  },

  isAtInstrBoundary() {
    return backend.isAtInstrBoundary()
  },
})

export const atari6502DebugAdapter: DebugAdapterPlugin = {
  id: 'atari-6502-debug',
  name: 'Atari 6502 (Altirra)',
  attach,
}
