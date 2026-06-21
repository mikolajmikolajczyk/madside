# DebugAdapterPlugin

> Source: [`packages/ports/src/plugin-debug.ts`](../../packages/ports/src/plugin-debug.ts). Atari 6502 reference impl: [`packages/debug-atari-6502/src`](../../packages/debug-atari-6502/src).

Bridges a CPU-agnostic `DebugTarget` to a specific `RunBackend`. The debugger UI (`Debug.tsx` + `panel-registers` + `panel-memory`) renders identically across any machine — register / flag names + step / breakpoint / read / write primitives come from the adapter.

## Contract

```ts
interface DebugAdapterPlugin {
  id: string                          // 'atari-6502-debug', ...
  name: string
  attach(backend: RunBackend): DebugTarget
}

interface DebugTarget {
  registers: readonly RegisterDescriptor[]   // { id, label, width: 1|2|4 }
  flags: readonly FlagDescriptor[]           // { id, label }
  readRegisters(): Promise<Record<string, number>>
  readFlags(): Promise<Record<string, boolean>>
  step(): Promise<number>             // returns new PC
  stepFrame(): Promise<number>
  setBreakpoints(addrs: Iterable<number>): void
  readMemory(addr: number, len: number, space?: string): Promise<Uint8Array>
  writeMemory(addr: number, bytes: Uint8Array): Promise<void>
  getPC(): number
  isAtInstrBoundary(): boolean
}
```

## Hello-world

Generic 6502 reuses the shared descriptor tables — adding the NES adapter at M9 is literally just attaching to its own `RunBackend`:

```ts
import type { DebugAdapterPlugin, RunBackend } from '@ports'
import { MOS6502_FLAGS, MOS6502_REGISTERS } from '@plugins/debug-atari-6502'

export const nes6502DebugAdapter: DebugAdapterPlugin = {
  id: 'nes-6502-debug',
  name: 'NES 6502 (jsnes)',
  attach: (backend: RunBackend) => ({
    registers: MOS6502_REGISTERS,
    flags: MOS6502_FLAGS,
    async readRegisters() {
      const cpu = backend.cpuState() as { a; x; y; pc; sp }
      return { a: cpu.a, x: cpu.x, y: cpu.y, pc: cpu.pc, sp: cpu.sp }
    },
    async readFlags() {
      const cpu = backend.cpuState() as { flags: Record<string, boolean> }
      return { ...cpu.flags }
    },
    async step()      { backend.step();         return backend.getPC() },
    async stepFrame() { backend.advanceFrame(); return backend.getPC() },
    setBreakpoints(a) { backend.setBreakpoints(a) },
    async readMemory(addr, len, space) { return backend.readMem(addr & 0xffff, len, space) },
    async writeMemory()         { throw new Error('writeMemory not supported') },
    getPC()             { return backend.getPC() },
    isAtInstrBoundary() { return backend.isAtInstrBoundary() },
  }),
}
```

Register + select via manifest:

```ts
plugins.register({
  plugin: { ...nes6502DebugAdapter, kind: 'debug-adapter' },
  source: { origin: 'builtin' },
})
```

```jsonc
{ "version": 2, "debugAdapter": "nes-6502-debug", ... }
```

## Notes

- `attach()` must be cheap — the host calls it on every RunBackend boot. Adapters typically close over `backend` and forward 1:1.
- Register descriptor `width` drives hex formatting (1 byte → `XX`, 2 bytes → `$XXXX`).
- `readMemory`'s optional `space` selects a named memory space declared by the `MachinePlugin`'s `memorySpaces` (e.g. NES `'ppu'` / `'oam'`); omit it (default) to read the CPU bus. A memory-viewer panel passes the space id through to the adapter.
- New machines with non-6502 register sets ship their own descriptor table; UI panel code stays unchanged.
- Manifest-driven runtime swap (multiple adapters in one workbench session) lands together with EmulatorPlugin (M4 follow-up) because both need the same project ↔ backend coupling.
