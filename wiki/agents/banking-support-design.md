# Bank-aware debugging — design gathering (#88 / #134)

> **Status: research + proposed design, NOT implemented.** This is the
> "gather everything needed to implement correct banking" deliverable. It maps
> the change surface, the per-target reality, the prior art, and a proposed
> madside model + phasing. The actual engine stays gated per-target (#134) — this
> doc is the basis for that work and a candidate ADR.

## The problem in one paragraph

When the same CPU address (e.g. `$8000`) maps to different *physical* bytes
depending on a bank-select register, madside today can't tell them apart. A
breakpoint at `$8000` fires regardless of the live bank; the source map
`addrToLoc: Map<number, SourceLoc>` collapses two banks' lines that share `$8000`
into one entry; the memory viewer shows whatever bank is mapped now and can't ask
for "$8000 in bank 7". This was fine for five ≤64K-flat machines, but **Atari
130XE (PORTB), NES (mappers), and ZX128 (paging) all bank** — and we now ship
Atari + NES + Genesis, so the gap is real.

## What's already true in the code (the seam inventory)

The debug/address stack is flat-keyed end to end. Each is a change site:

**Type model (`@ports`)**
- `packages/ports/src/source-map.ts:12,14,19` — `addrToLoc: Map<number, SourceLoc>`, `locToAddr: Map<file, Map<line, number>>`, `lineToAddrs?` — all bare-number address keys. `SourceLoc = {file, line}` carries no bank.
- `packages/ports/src/debug-info.ts:13,46` — **`DebugLocation.addr: number` + `space?: string` ALREADY EXISTS** as the reserved bank/space hook (ADR-0011: *"`space` names a non-default address space / bank … a future >64K/banked target slots in"*). `DebugFrame` (memptr) also has `space?`. **Nothing populates it.**

**Breakpoints**
- `packages/workbench-core/src/debug-service.ts:26,99-106` — runtime set `Set<number>`; `setBreakpoint(addr)`/`clearBreakpoint(addr)`.
- `packages/ports/src/storage.ts:98,100` + `packages/storage-idb/src/breakpoints.ts` — persisted as `Map<file, Set<lineNumber>>` (source-line based — good, bank-agnostic at rest, but resolves to bare PC).
- `apps/ide/src/ui/hooks/useBreakpointAddrs.ts` — translates source lines → bare PC via `sourceMap.locToAddr`/`lineToAddrs`, returns `Set<number>`.
- `useRunControls.ts` (stepLine via `addrToLoc.get(pc)`), `useCursorMemory.ts`, `useProjectLabels.ts` — all bare-PC lookups.

**Contracts + backends**
- `packages/ports/src/services/run-service.ts:43-44` — `readMem(addr, len, space?)` (space already there), `setBreakpoints(addrs: Iterable<number>)` (bare).
- `packages/ports/src/plugin-debug.ts:45,50` — `DebugTarget.setBreakpoints`/`readMemory` same.
- Adapters: `debug-atari-6502`/`debug-zx-z80` mask `& 0xffff` on the cpu space (bypass for ppu/oam); `debug-m68k` no mask (24-bit native). All forward `space` 1:1, none know banks.
- Backends `emulator-{c64,zx}-chips`, `emulator-nes-jsnes`, `emulator-genesis-gpgx`: `readMem` dispatches on `space` id with a HARD-CODED physical layout per space (jsnes: ppu `& 0x3fff`, oam `& 0xff`). **No way to query/select the live bank register.**

**Memory map + spaces**
- `packages/ports/src/plugin-machine.ts` — `memoryMap: MemoryRegion[]` (flat cold-boot layout, no bank field/count) + `memorySpaces` (orthogonal spaces ppu/oam/vram — **not** banks of the CPU window). MemoryPanel is width-aware (#133, addrMax from map) but single-space.

**Toolchains — bank data exists and is DISCARDED**
- `packages/toolchain-ca65/src/cc65-dbg.ts` — parses `seg` records, uses only `seg.start` (run addr); **drops `seg.ooffs` (file offset), `seg.oname`, and `seg.bank`** — the exact physical/bank fields a banked build emits.
- `packages/toolchain-mads/src/wasm-mads/labParser.ts` — `.lab` has a leading **virtual-bank column** when bank≠0; the regex ignores it. (`.lst` likewise prepends `NN,` before the address.)
- `toolchain-clownassembler` — flat (correct; Genesis is flat).
- `toolchain-z88dk` — bank identity lives in the `SECTION` name + `--split-bin`; not parsed.

## Per-target reality (what actually banks, and how)

| Machine | Banks today in madside | Mechanism | Window / banks | madside outlook |
|---------|------------------------|-----------|----------------|-----------------|
| **Atari 130XE** | flat (`memoryMode:2`) | PORTB `$D301` bits 2–3 (+CPE/VBE 4/5) | `$4000–$7FFF` 16K, **4 ext banks**; CPU & ANTIC can point at different banks via the same window | **Cleanest case** — single fixed window, fixed semantics, Altirra backend already debugs it. **Recommended first target.** |
| **NES** | flat (NROM only) | cartridge mapper regs in `$8000–$FFFF` | PRG 8/16/32K windows + CHR (PPU `$0000–$1FFF`); MMC1/UxROM/CNROM/MMC3… | Highest demand + most varied; toolchains already emit physical (Mesen `.mlb` `P:`, FCEUX per-bank `.nl`). Good 2nd target. |
| **ZX Spectrum** | flat (**48K only**) | port `$7FFD` | `$C000–$FFFF`, 8×16K RAM pages + ROM select | Needs a new 128K machine variant + 128 emulator first. |
| **C64** | flat (cold-boot) | `$01` processor port (LORAM/HIRAM/CHAREN); cart EXROM/GAME; REU | overlay over fixed 64K (reads select ROM/RAM/IO; writes fall to RAM) | Overlay-state, not paging; realistic but lower value for `.prg`. |
| **Genesis** | flat (**correct**) | SSF2 `$A130Fx` (>4MB), Z80 `$A06000` window | linear 24-bit for normal carts | Leave flat; banking is an edge case. |

**Logical vs physical** is the crux everywhere: CPU-visible logical addr (`$8000`)
vs the physical byte (PRG offset `$1C000`, or "ext bank 2 + $0000"). The mapping is
`physical = bank * window_size + (logical - window_base)`.

## How the field does it (prior art → taxonomy)

Three address models (tools converge on **using all three for different jobs**):

| Model | Shape | Tools | Trait |
|-------|-------|-------|-------|
| **Physical / flat** | `(memory-type, offset)`, offset may exceed 16-bit | **Mesen** (`P:`/`R:`/`S:`/`W:`/`G:`), **BizHawk** physical domains, cc65 `ooffs` | Identity = chip offset; CPU addr is a *projection*. **Bank-correct for free.** |
| **Logical + bank qualifier** | `bank:addr` / `XX'YYYY` / `@bank:addr` | FCEUX `bb:`, **VICE** `@io:`, **Altirra** `$EF'4800`, WLA-DX `bb:aaaa`, no$ GB | 16-bit CPU addr primary, bank token disambiguates. Matches programmer mental model. |
| **Overlay / named spaces** | `space::offset`, one space per bank | **Ghidra** `bank1::8000`, MAME device/space tags, BizHawk domains | Each bank a first-class namespace; **all banks coexist** (static views). |

**Breakpoints — near-universal convention: trigger on the live CPU address, add bank-awareness on top**, three ways:
1. **Physical-offset BP (bank-implicit)** — key on a ROM offset; only hits when that bank is mapped. *Only Mesen does this cleanly* — strongest, no condition.
2. **Condition on a bank register** — CPU-addr BP + predicate reading the live bank latch (FCEUX `K==#5`, VICE `@io:…`, MAME `b@<bankreg>==3`, openMSX `address_in_slot`, Altirra `db($d301)=$ef`). Most common; needs the emu to expose "current bank" to conditions.
3. **Bank-qualified literal** — `bp $EF'4000` (Altirra). Ergonomic middle ground.

**Source maps carry bank** as: a per-segment attribute (cc65 `.dbg`), an explicit pair on every symbol (WLA `bb:aaaa`), a file/space partition (FCEUX `.nl`, Ghidra overlays, Mesen prefixes), or not at all (flat physical offset).

**Field's converged split:** *physical for identity, logical for ergonomics,
named-spaces for static all-banks views.*

## Proposed madside model

Reuse the seam we already reserved — **`space`** — as the bank/domain dimension,
rather than inventing a parallel `bank` field. It already exists on
`DebugLocation`, `readMemory`, and `DebugTarget.readMemory`.

**1. Canonical key = `(space, offset)` physical.** A breakpoint, label, and
source-map entry key on a *physical domain* + offset (offset may exceed 16-bit).
Domains are machine-declared (extend `memorySpaces`): e.g. NES `prg-rom`,
`wram`, `save-ram`; Atari `ext-ram`; plus the live `cpu` view. Flat machines use
only `cpu` (identity) → **zero change for Atari-flat/C64/ZX48/Genesis/NES-NROM.**
This is the Mesen/BizHawk "physical for identity" model, and cc65's `.dbg`
already provides `(oname, ooffs, bank)` to populate it.

**2. Live projection contract.** The backend exposes the current bank mapping:
```
bankMap(): { window: [lo, hi], space: string, bankOffset: number }[]
```
so the UI projects physical↔cpu and shows "$8000 [prg-rom +$1C000 / bank 7]".
This is the one genuinely new backend capability (read the emulated bank latch:
jsnes `mmap`, Altirra PORTB, chips).

**3. Breakpoint hit-test.** Prefer **physical-offset BP** (Mesen-style) where the
backend can map cpuPC→physical each step; fall back to **CPU-addr BP + live-bank
predicate** (FCEUX-style) where it can't. Key the runtime set on `{space, addr}`;
default `space:'cpu'` preserves today's behavior verbatim.

**4. User-facing notation = `space:addr`** (logical+qualifier, ergonomic),
internal key physical `(space, offset)`. Matches cc65 + Mesen, our actual
toolchain + the closest reference emulator.

**5. Static all-banks view (later)** — a Ghidra-style per-bank disassembly/label
surface for the editor, once physical keying exists.

### Change surface (what each phase touches)
`SourceLoc`/`DebugLocation` gain the physical pairing; `addrToLoc` keyed by
`(space, offset)`; `debug-service` breakpoint set → `Set<{space, addr}>`;
`setBreakpoints`/`readMemory`/`bankMap` on the backend; `useBreakpointAddrs`/
`useCursorMemory`/`useProjectLabels`/gutter thread `space`; MemoryPanel gets a
domain/bank selector (BizHawk domains); toolchain parsers STOP discarding
`seg.ooffs`/`bank` (cc65) + the `.lab` bank column (mads).

## The two halves: static line→bank, live which-bank-now

Bank-aware debugging is a join of two *known* facts — neither is guessed:

- **Static (build time): which bank is a source line in?** The toolchain placed
  the code, so it knows. The bank rides through the debug info → source map.
- **Live (run time): which bank is mapped now?** The emulator implements the
  banking hardware, so it knows. The backend reads it (`bankMap()`).

A breakpoint fires when the two match. With a **physical-offset breakpoint**
(decision 3) the match is automatic — the physical byte only executes when its
bank is live, so you never explicitly compare "line bank == live bank".

### Static — how a line knows its bank (setting a BP in the editor)

You click the gutter on `src/level.s:42` → the breakpoint resolves through the
**source map**, which now carries `(space, offset)` per entry (decision 4). The
toolchain emitted the bank because *it* assigned the segment to a bank:

- **cc65** — `line → span → seg`, and `seg` carries `bank` (when the MEMORY area
  has `bank=`) + `ooffs` (physical offset). Unambiguous: the linker put line 42 in
  exactly that segment/bank.
- **MADS** — the `.lab`/`.lst` virtual-bank column per symbol/line.

Three cases the model must handle:
1. **One line → one bank** (normal): resolves to a single `(space, offset)`. Easy.
2. **One line → many banks** (shared code duplicated into several bank segments —
   common on NES where a routine must be callable from any bank; or an `include`
   pulled into multiple bank segments): resolves to a **set** of physical keys —
   extend the existing `lineToAddrs` (already multi-address-per-line for cc65 C,
   #49) to multi-`(space, offset)`. A BP on that line traps in **whichever** bank
   the PC is in. Default = break in all; narrowing to one bank is a later UI
   refinement.
3. **Fixed / always-mapped code** (the pinned last NES bank at `$C000–$FFFF`,
   non-banked RAM/zero-page): the toolchain marks it in the fixed segment; bank is
   constant/irrelevant → plain `cpu`-space entry, no change from today.

**The current-line highlight is the same lookup in reverse:** on stop, the backend
gives `cpuPC`; map it to physical `(space, offset)` (via the live `bankMap()`),
then `addrToLoc.get((space, offset))` → `(file, line)`. Because the *physical* key
is unique per bank, two banks' `$8000` resolve to different source lines with no
ambiguity — the flat `Map<number, …>` couldn't do this.

**Degenerate case (the only "uncertainty", and it's missing data not guessing):**
hand-rolled asm banking with no segment directives → the toolchain emits no bank
for the line → we can't key it physically. Fall back to a `cpu`-address BP (fires
in any bank) + an optional manual `bank:addr` qualifier.

### Live — extracting the current bank, per core

There is no *guessing* of the live bank: the emulator must track it to run at all.
The catch is that **several bank-select registers are write-only / not bus-readable**
(ZX128 `$7FFD`, the NES mapper latches MMC1 shift-reg / MMC3 R0–R7) — so
`bankMap()` **cannot** be a `readMemory(addr)`; it must read the core's tracked
state. That makes it a dedicated per-backend capability, and each core stores it
differently:

| Core | Where the bank state lives | Extraction |
|------|----------------------------|------------|
| **Altirra** (Atari) | PORTB `$D301` + the MMU translation (debugger-grade core) | read PORTB / ask the MMU for the translation — Altirra exposes both (Avery Lee's own debugger uses them) |
| **jsnes** (NES) | **copies the bank's bytes into `cpuMem`** on switch (`loadRomBank(bank, addr)` — verified in `jsnes.js`), plus per-mapper register fields | no clean "which bank" getter → **instrument `loadRomBank`** to record bank→window, or read the mapper's register fields per-mapper. jsnes is plain JS, so internals are directly readable. cpuPC→physical is natural since the bytes are already copied. |
| **chips** (C64 / ZX) | the `$01` / `$7FFD` latch inside the core | expose via an Embind getter |
| **gpgx** (Genesis) | flat (SSF2 `$A130Fx` only for >4 MB) | skip; add the SSF2 regs only if a >4 MB ROM ever matters |

So `bankMap()` is a per-backend adapter over the same interface — Altirra has a
register, jsnes copies bytes, chips has a latch. **The decode (register bits →
which physical domain/offset) lives in the backend**, next to the core that holds
the state; the machine plugin only declares the domains + windows
(`$4000–$7FFF` → `ext-ram`, the 4-bank count, the PORTB bit positions).

## Recommended phasing (gated per-target, per #134)

- **Phase 0 — capture, don't use (cheap, no behavior change).** Stop discarding
  the physical/bank fields the toolchains already emit: cc65 `.dbg`
  `ooffs`/`oname`/`bank` + mads `.lab`/`.lst` bank column → fold into an extended
  `SourceLoc`/`SourceMap` (physical offset + optional space), unused for now.
  Pure forward-compat; low risk; unblocks everything later. Add a fixture test.
- **Phase 1 — one reference target end-to-end.** Recommend **Atari 130XE PORTB**
  (single `$4000–$7FFF` window, 4 banks, fixed semantics, Altirra backend already
  models it) — the "68000-style" clean validation. Wire physical keying +
  `bankMap()` + bank-aware BP + the memory-domain UI for it alone. The contract
  generalizes.
- **Phase 2 — second target validates the abstraction.** **NES mappers**
  (multi-window, variable) — same way the 68000 validated the plugin contracts.
  Then ZX128 / others land cheaply.

Each phase is per-machine code (machine plugin + its backend + its toolchain
parser) and does NOT compound from app features (#134's thesis).

## Open questions for the ADR

1. **`space` overload vs new `bank` field** — fold banks into `space` (proposed,
   reuses the seam) or add an orthogonal `bank`? `space` already means "orthogonal
   memory" (ppu/oam); banks are "alternative contents of the CPU window" — subtly
   different. Decide whether one axis (`space`) carries both or we add a second.
2. **Breakpoint storage** — keep source-line storage (bank-agnostic at rest,
   resolve per-build) or persist `(space, addr)`? Source-line is simpler + already
   how it works; physical resolution happens at sync time.
3. **Offset width** — physical offsets exceed 16-bit; confirm the UI/hex
   formatting (gutter `toHex4`) widens cleanly (the #133 width work already did the
   address-math half).
4. **First target** — 130XE (cleanest) vs NES (highest demand). Recommend 130XE
   for the clean contract, NES second.

## Sources

Per-target hardware: atariarchives.org / Altirra (PORTB), nesdev.org wiki
(mappers/iNES), c64-wiki + codebase64 (`$01`/PLA), worldofspectrum (`$7FFD`),
Sega Technical Overview + Plutiedev (SSF2 / Z80 window). Prior art: Mesen,
FCEUX, MAME, Ghidra (overlay spaces), VICE, Altirra, openMSX, BizHawk docs +
source; toolchain formats: cc65 `ld65` source (segments/span/lineinfo), WLA-DX
symbols, MADS `.lab`/`.lst`, z88dk map/sections. Full citations in the research
threads behind this doc.
