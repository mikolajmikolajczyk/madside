# ADR-0014: Bank-aware addressing — physical `(space, offset)` keys, gated per-target

- **Status:** Accepted
- **Date:** 2026-06-24
- **Deciders:** Mikołaj
- **Tags:** architecture, debug, plugins, addressing, machine, toolchain, scalability

## Context

madside's debug/address stack is flat-keyed: breakpoints are a `Set<number>`,
the source map is `addrToLoc: Map<number, SourceLoc>` + `locToAddr: Map<file,
Map<line, number>>`, and `readMemory(addr, len, space?)` carries a `space`
dimension that today only serves *orthogonal* memories (NES `ppu`/`oam`, Genesis
`vram`/`cram`/`vsram`) — never bank selection. This was correct while every
machine was ≤64K flat.

It no longer holds. We ship Atari 8-bit, NES, and Genesis; of these the **Atari
130XE banks** (PORTB `$D301`, the `$4000–$7FFF` window over 4 extended banks) and
**NES banks** (cartridge mappers — PRG in `$8000–$FFFF`, CHR in PPU
`$0000–$1FFF`). When the same CPU address (`$8000`) maps to different physical
bytes per bank, madside cannot distinguish them: a breakpoint at `$8000` fires
regardless of the live bank, and the source map collapses two banks' lines that
share `$8000` into one entry.

This was anticipated. ADR-0011 deliberately left `DebugLocation.space?` /
`DebugFrame.space?` as a reserved hook *"so the 16-bit-bus debt (#88/#133) doesn't
grow and a future >64K/banked target slots in"*, and #88 was split into #133
(address-seam width — done, dropped the `& 0xffff` mask) and **#134 (the actual
per-target banking engine — gated on a concrete target)**. This ADR fixes the
*model* so #134's per-target work has a contract to fill in. The full research —
per-machine banking hardware, toolchain bank/segment output, and a prior-art
survey (Mesen / FCEUX / MAME / Ghidra / VICE / Altirra / openMSX / BizHawk + the
cc65 / WLA-DX / MADS / z88dk debug formats) — is gathered in
[`../agents/banking-support-design.md`](../agents/banking-support-design.md).

Prior art converges on three address models used for different jobs: **physical /
flat** `(memory-type, offset)` (Mesen `P:`/`R:`, BizHawk physical domains, cc65
`ooffs`) — bank-correct for free; **logical + bank qualifier** `bank:addr`
(FCEUX, VICE `@io:`, Altirra `XX'YYYY`, WLA-DX `bb:aaaa`) — matches the
programmer's mental model; and **overlay / named spaces** `bank::offset` (Ghidra,
MAME) — all banks coexist for static views. Breakpoints almost universally
trigger on the live CPU address and add bank-awareness via a physical-offset key,
a condition on a bank register, or a bank-qualified literal.

## Decision

**1. The canonical address key is a physical `(space, offset)` pair, and `space`
is the bank/domain dimension** — reusing the existing seam, not adding a parallel
`bank` field. A *space* names either an orthogonal memory (today's `ppu`/`oam`/
`vram`) or a **physical memory domain** that backs a bank-switched CPU window
(e.g. NES `prg-rom` / `wram` / `save-ram`; Atari `ext-ram`). The offset is into
that domain and **may exceed 16 bits**. The live CPU view is the `space: 'cpu'`
window.

> **Phase 1 refinement (machine-atari-xl).** The *key* stays `(space, offset)` as
> decided. But machines do **not** declare a switchable window by extending
> `memorySpaces`: a `MemorySpace` is a *flat* `[0, size)` space (PPU VRAM/OAM) with
> no window range and no live selector. A bank-switched CPU window needs both, so
> it's declared via a dedicated `MachinePlugin.banks: BankWindow[]` descriptor
> (CPU range + bank count + a bus-readable `selector` reg/mask/shift). `space`
> remains the one debug key; `BankWindow` only declares *how a window projects to
> it*. This resolves the "`space` overload vs new field" open question: a new
> *declaration* field, the same *key*. `MemorySpace` is untouched.

Flat machines (Atari-flat, C64, ZX48, Genesis, NES-NROM) use only `cpu` with an
identity offset — so **this decision is a no-op for every machine until its
banking is implemented.**

**2. Backends expose a live projection.** A bank-switched backend implements a
`bankMap()`-style query reporting which physical domain + offset each switchable
CPU window currently resolves to. This is the one genuinely new backend
capability (read the emulated bank latch: jsnes `mmap`, Altirra PORTB, chips). It
lets the UI project physical↔CPU and render "`$8000` [prg-rom +$1C000]".

**3. Breakpoints key on `(space, addr)`; default `space:'cpu'` is today's
behavior verbatim.** The hit-test prefers a **physical-offset breakpoint**
(Mesen-style: fires only when that bank is mapped) where the backend can map
cpuPC→physical each step, and falls back to a **CPU-address breakpoint + a
live-bank predicate** (FCEUX-style) otherwise. **At rest, breakpoints stay stored
as source lines** (`Map<file, Set<line>>`, bank-agnostic); physical resolution
happens at sync time via the source map — so a rebuild re-resolves them.

**4. Source maps carry the physical pairing; toolchains stop discarding it.** The
toolchains already emit it and we throw it away: cc65 `.dbg` `seg.ooffs` /
`seg.oname` / `seg.bank`, and the MADS `.lab`/`.lst` virtual-bank column.
`SourceLoc` / the source-map keys gain the `(space, offset)` pairing; flat
toolchains (clownassembler, z88dk-flat) keep `cpu`-identity.

**5. User-facing notation is `space:addr`** (logical + qualifier — ergonomic),
with the physical `(space, offset)` as the internal key. This matches our actual
toolchain (cc65) and the closest reference emulator (Mesen). A Ghidra-style
all-banks static disassembly/label view is deferred but compatible.

**6. Implementation is gated per-target (#134), phased:**
- **Phase 0** — capture, don't use: stop discarding the cc65 / MADS bank+offset
  fields; fold them into the extended source map, unused. No behavior change;
  forward-compat; low risk.
- **Phase 1** — one reference target end-to-end: **Atari 130XE** (single fixed
  `$4000–$7FFF` window, 4 banks, fixed PORTB semantics, the Altirra backend
  already models it). The clean validation case, like the 68000 was for the
  plugin contracts.
- **Phase 2** — **NES mappers** (multi-window, variable) validate the
  abstraction; ZX128 and others then land cheaply.

Each phase is per-machine code (machine plugin + its backend + its toolchain
parser) and does not compound from app features — #134's thesis.

## Alternatives considered

- **A parallel `bank` field orthogonal to `space`.** Rejected: `space` already
  means "an address dimension beyond the default CPU view"; a bank is exactly
  that. Two axes double the threading surface (every lookup, every BP, every
  store) for no expressive gain — a domain id subsumes a bank id. The subtle
  semantic difference (orthogonal memory vs alternative window contents) is
  carried by the domain's declaration, not a separate field.
- **Pure logical `bank:addr` keys (FCEUX / WLA-DX style).** Rejected as the
  *internal* key: a bank qualifier is machine-specific (PORTB value vs PRG bank
  index vs slot.subslot.segment) and the same byte can carry several valid
  `bank:addr` forms (mirrors), so it needs normalization anyway. Kept as the
  *user-facing* notation (decision 5) because it matches how programmers think.
- **Overlay address spaces, one per bank (Ghidra / MAME).** Rejected as the
  primary model: excellent for static all-banks analysis but heavy for live
  debugging (a space per bank explodes for many-bank carts, and live debug still
  needs a projection to the running CPU view). Retained as a future static view.
- **Condition-only bank breakpoints (no physical key).** Rejected as the sole
  mechanism: it works (FCEUX/VICE/MAME do it) but pushes bank-correctness onto
  hand-written predicates. We adopt it only as the fallback when a backend can't
  provide the physical projection.
- **Do nothing / stay flat.** Rejected: three of our machine families bank;
  line-debug and breakpoints are already wrong for banked builds, and the longer
  the flat assumption ossifies across the ~two-dozen seams, the more expensive
  the migration.

## Consequences

- **No migration for existing machines.** `space` defaults to `cpu` with identity
  offsets; all five current machines are unchanged until their banking is built.
- **The plugin contracts grow, once.** `memorySpaces` gains physical domains;
  `RunBackend` / `DebugTarget` gain the `bankMap()` projection and `(space, addr)`
  breakpoints; `SourceLoc` / source-map keys gain the physical pairing. These are
  additive and land incrementally per phase.
- **Toolchain parsers must preserve bank/offset** (cc65, MADS) — Phase 0 work,
  independently testable with fixtures.
- **UI gains a memory-domain selector** (BizHawk-domains style) and bank-annotated
  gutter/labels; offsets may exceed 16 bits, so hex formatting widens (the #133
  width work already did the address-math half).
- **#134 now has a contract to implement against** rather than a blank design;
  #88's umbrella is correspondingly narrowed.

## Extension boundary — how to add bank support to a new machine

The seam is **`bankMap(): BankProjection[]`**. Everything above it is unified and
written once; the only per-machine code is the backend method that reads the live
bank off *that* core. This is the plugin-architecture thesis applied to banking:
the workbench core stays machine-agnostic; each machine's quirk is confined behind
a uniform port.

**Unified — same for every machine, never touched when adding one (`@ports`):**
- The contract: `RunBackend.bankMap()` / `DebugTarget.bankMap()`, and the data
  shapes `BankProjection { window, start, end, space, bankOffset }` /
  `BankBreakpoint { addr, space }`. `space` is the one debug key.
- The engine: `bank-match.ts` (`splitBreakpoints` / `liveSpaceAt` /
  `breakpointFires`) and `source-map.ts` (`resolvePcLoc` / `resolveLineSpace` /
  `bankedAddrToLoc`).
- The consumers: the Emulator run-loop trap test, the current-line / follow-PC
  resolution, the MemoryPanel bank badge, the editor gutter, the debug-adapter
  `bankMap()` forward. These see only `BankProjection` — never a `$D301` or a
  mapper register.

**Per-machine — the only custom code: the backend's `bankMap()` body.** It reads
the live bank from the core and returns `BankProjection[]`. Two realised shapes:
- **Bus-readable selector + fixed window (Atari 130XE).** The window and the
  PORTB `$D301` decode are *declared as data* in `MachinePlugin.banks`
  (`BankWindow` with a `selector` reg/mask/shift), and the backend reuses the
  shared `decodeBankWindow(window, regByte)` — so even the `bankMap()` body is
  mostly shared. Add a machine like this with **no new logic**, only data.
- **Write-only latch / per-mapper layout (NES mappers).** The bank register can't
  be read off the bus and the window layout is per-ROM, so `MachinePlugin.banks`
  is left undefined and the backend derives the live bank from core state — for
  jsnes, by wrapping the mapper's bank-load primitives. This is the genuinely
  custom path; it is ~a dozen lines, confined to the backend.

**The one branch that decides which path:** *is the bank selector readable from
the CPU bus and is the window layout fixed?* Yes → declare `banks` data, reuse
`decodeBankWindow`. No → derive in the backend. Nothing else fans out per machine.

Evidence this holds: NES (Phase 2) reused `bank-match.ts`, the source-map
resolvers, the `atari-6502` adapter's `bankMap()` forward, and the entire UI/run
loop **unchanged** — the only NES-specific code is the jsnes backend's bank
tracking.
