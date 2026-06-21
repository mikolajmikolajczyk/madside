---
title: Debug adapters
description: Register/flag descriptors and the debug surface — reuse the shared 6502 descriptors.
sidebar:
  order: 9
---

A **debug adapter** bridges a CPU-agnostic `DebugTarget` to a specific run backend. The debugger UI (register panel, memory panel, step controls) renders identically across any machine — the register/flag *names* and the step/breakpoint/read/write *primitives* come from the adapter.

Debug adapters are **built-in only**. The 6502 reference impl is `src/plugins/debug-atari-6502/`, which exports reusable descriptor tables.

## The contract

Source: `@ports/plugin-debug.ts`.

```ts
interface DebugAdapterPlugin {
  readonly id: string          // 'atari-6502-debug', …
  readonly kind: 'debug-adapter'
  readonly name: string
  attach(backend: RunBackend): DebugTarget
}

interface RegisterDescriptor {
  id: string                   // 'a', 'pc', 'sp'
  label: string                // 'A', 'PC'
  width: 1 | 2 | 4             // drives hex formatting (1 → XX, 2 → $XXXX)
}

interface FlagDescriptor {
  id: string                   // 'n', 'z'
  label: string                // 'N', 'Z'
}

interface DebugTarget {
  readonly registers: readonly RegisterDescriptor[]
  readonly flags: readonly FlagDescriptor[]

  readRegisters(): Promise<Record<string, number>>
  readFlags(): Promise<Record<string, boolean>>
  step(): Promise<number>                    // advance one instruction; returns new PC
  stepFrame(): Promise<number>               // advance one frame; returns new PC
  setBreakpoints(addrs: Iterable<number>): void
  readMemory(addr: number, len: number, space?: string): Promise<Uint8Array>
  writeMemory(addr: number, bytes: Uint8Array): Promise<void>
  getPC(): number
  isAtInstrBoundary(): boolean
}
```

`attach(backend)` builds a `DebugTarget` bound to a [run backend](/docs/extending/emulator/). The adapter declares its register/flag *layout* up front (the descriptor arrays) and forwards the primitives to the backend. The host calls `attach` once per backend boot, so **keep it cheap** — typically the adapter just closes over `backend` and forwards 1:1.

## Reusing the shared 6502 descriptors

The generic 6502 register set (A / X / Y / PC / SP) and flag set (N V B D I Z C) ship from the Atari adapter and are reusable. A new 6502 machine's adapter is mostly just "attach to a different backend":

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
      const cpu = backend.cpuState() as { a: number; x: number; y: number; pc: number; sp: number }
      return { a: cpu.a, x: cpu.x, y: cpu.y, pc: cpu.pc, sp: cpu.sp }
    },
    async readFlags() {
      const cpu = backend.cpuState() as { flags: Record<string, boolean> }
      return { ...cpu.flags }
    },
    async step()      { backend.step();         return backend.getPC() },
    async stepFrame() { backend.advanceFrame();  return backend.getPC() },
    setBreakpoints(a) { backend.setBreakpoints(a) },
    async readMemory(addr, len, space) { return backend.readMem(addr & 0xffff, len, space) },
    async writeMemory()                { throw new Error('writeMemory not supported') },
    getPC()             { return backend.getPC() },
    isAtInstrBoundary() { return backend.isAtInstrBoundary() },
  }),
}
```

A machine with a non-6502 register set ships its own descriptor table; the UI panel code stays unchanged — it iterates `target.registers` / `target.flags` and formats by `width`.

## Register width drives formatting

`width` (in bytes) determines hex rendering in the register panel: a 1-byte register shows `XX`, a 2-byte register shows `$XXXX`. Declare it accurately per register.

## Memory spaces

`readMemory(addr, len, space?)` forwards to the backend's `readMem` with an optional `space` id. The CPU bus is the default; pass a space id (`'ppu'`, `'oam'`, …) declared in the machine's `MachinePlugin.memorySpaces` to read an extra address space. See [Machine plugins](/docs/extending/machine/#memory-spaces).

## Registering + selecting

```ts
plugins.register({ plugin: { ...nes6502DebugAdapter, kind: 'debug-adapter' }, source: { origin: 'builtin' } })
```

```jsonc
{ "version": 2, "debugAdapter": "nes-6502-debug" }
```

The active adapter is paired with its machine and backend in `createWorkbench`'s machine-selection table — resolved from the registry via the machine's `compatibleDebugAdapters[0]`. `DebugService` exposes the live `DebugTarget` via `debug.target()` once a backend is booted, and `setActiveMachine` swaps machine + emulator backend + adapter together via `debug.setAdapter`.
