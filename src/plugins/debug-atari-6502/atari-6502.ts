// DebugAdapter plugin for the Atari 6502 (Altirra backend). Exposes the
// generic MOS 6502 register/flag layout so the debugger panel renders
// identically across any 6502 machine (NES reuses MOS6502_* + a tiny adapter
// against its own backend).

import type { Cpu6502State, DebugAdapterPlugin, DebugTarget, RunBackend } from '@ports'
import { MOS6502_FLAGS, MOS6502_REGISTERS } from './mos6502'

const attach = (backend: RunBackend): DebugTarget => ({
  registers: MOS6502_REGISTERS,
  flags: MOS6502_FLAGS,

  async readRegisters() {
    const cpu = backend.cpuState() as Cpu6502State
    return { a: cpu.a, x: cpu.x, y: cpu.y, pc: cpu.pc, sp: cpu.sp }
  },

  async readFlags() {
    const cpu = backend.cpuState() as Cpu6502State
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
    // Forward the space id to the backend. 'cpu' (default) masks to the 16-bit
    // bus; other spaces (NES 'ppu'/'oam') are clamped by the backend to their
    // own range. The generic 6502 adapter stays machine-neutral — it relays.
    return backend.readMem(space && space !== 'cpu' ? addr : addr & 0xffff, len, space)
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
