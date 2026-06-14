# NES uses MADS (not ca65); machines declare named memory spaces

**Date:** 2026-06-13
**Decider:** Mikołaj
**Tags:** platform-strategy | plugin-contract

## Context

M9 (v0.8.0) validated the plugin abstraction with a second machine, the NES.
Two questions had no written decision: which toolchain assembles NES code, and
how a debugger reads machine state that isn't on the CPU bus (the NES PPU has
its own VRAM + OAM, invisible to a flat `readMem(addr,len)`).

ADR-0001 sketched NES as a future ca65/ld65 target. But the NES CPU is a 6502,
and MADS — already shipped for Atari — assembles raw binaries. A short spike
proved MADS emits a valid NROM iNES image directly (`opt h-`, a hand-rolled
16-byte header before the PRG, `:$fffa-* dta $ff` PRG padding, CHR-RAM), and
jsnes boots and executes it. No second toolchain was needed to get a second
platform running.

## Decision

1. **NES ships on MADS, not ca65.** The MADS→NES iNES idiom is the supported
   path for v0.8.0. ca65/ld65 stays in the backlog (`6bed971`) as a *future*
   toolchain for C/neslib workflows, not a prerequisite for NES support.
2. **Machines declare extra address spaces via `MachinePlugin.memorySpaces`**,
   and reads take an optional space id: `readMemory(addr, len, space?)` on
   DebugTarget / `readMem(addr, len, space?)` on RunBackend. The NES declares
   `'ppu'` and `'oam'`; absent/`undefined` means the CPU bus (Atari needs
   nothing). This is the universal mechanism — any future machine (C64 VIC,
   etc.) adds spaces without touching the core. Contract detail lives in
   [`../plugin-api/machine.md`](../plugin-api/machine.md) and
   [`../plugin-api/debug-adapter.md`](../plugin-api/debug-adapter.md).

## Alternatives considered

- **ca65/ld65 for NES** — lost: adds a whole toolchain + linker-config surface
  to ship one machine MADS already covers. Deferred, not rejected forever.
- **Pre-built `.nes` seed instead of assembling** — lost: hides the toolchain
  path the IDE exists to exercise. (The 16 KB PRG `dta` fill is slow in wasm
  ~1.2 s; accepted, or sidestepped with CHR-RAM, rather than pre-building.)
- **PPU/OAM as a magic high address range on the CPU bus** — lost: leaks NES
  specifics into the flat memory model; named spaces keep machines self-describing.

## Trigger to revisit

A NES project that needs C, a linker, or bank-switched mappers beyond NROM →
revisit ca65/ld65. A machine whose extra state doesn't fit the
`(addr, len, space)` shape (e.g. register files, banked windows) → revisit the
memory-space contract.
