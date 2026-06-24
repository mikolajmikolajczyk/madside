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

## Phase 1 execution plan — Atari 130XE (the reference target)

> **Self-contained handoff.** Phase 0 (capture) shipped: `SourceLoc.space?/offset?`
> + cc65 `.dbg` (`seg.bank`/`ooffs` → `space:'bank{N}'`, offset) + MADS `.lst`
> (`BB,AAAA` prefix → `space:'bank{N}'`, no offset). Both verified from real output,
> flat builds untouched, 550 tests. ADR-0014 is the decided model. This section is
> everything needed to execute Phase 1 end-to-end.

### Goal
A MADS 130XE banked program → build (bank already captured into the source map) →
run on Altirra → a **line breakpoint in bank-switched code fires only when that
bank is live**, the current-line highlight resolves the right bank, and the memory
viewer can show the active bank. This validates the ADR-0014 contract for one
target, the way the 68000 validated the plugin contracts.

### Why 130XE is the clean first target
- **Single fixed window** `$4000–$7FFF` (16K), **4 ext banks**, selected by **PORTB
  `$D301` bits 2–3** (CPE bit 4 gates the CPU, VBE bit 5 gates ANTIC; OS/BASIC/
  self-test overlays on bits 0/1/7 are separate).
- **PORTB `$D301` is bus-readable** (PIA port B) — so the live bank = `readMem(0xD301)`
  + decode bits 2–3. **No new emulator-core API needed** (NES mapper latches / ZX
  `$7FFD` are write-only — Atari is the easy case). **Verified:** the Altirra
  backend (`apps/ide/src/adapters/emu/altirra.ts`) already has
  `core.readMem(addr, len)`.
- **MADS is the native banking toolchain** (`OPT B+` = hardware banks over the
  `$4000–$7FFF` window; `lmb`/`nmb`/`rmb` set the bank counter) and Phase 0 already
  captures its `.lst` bank prefix. (cc65 130XE banking is manual via a custom
  linker config with `bank=` MEMORY areas — secondary.)
- **No physical offset needed from the toolchain**: for a 130XE bank the offset is
  `bank * 0x4000 + (addr − 0x4000)`, derivable from `(bank, addr)`. So MADS's
  space-only capture suffices; compute the offset in the decode.

### Steps (ordered, de-risk first)
1. **Verify the real banked-MADS shape for the actual window (½ day). — DONE.**
   Assembled a 130XE program with `OPT B+` + code at `$4000` switched across banks
   via `lmb/nmb` (mads 2.1.8 via wasm). **Verified results:**
   - `.lst`: bank-0 code emits **no prefix** (`4000 A9 00`); bank≠0 emits the
     `BB,AAAA` prefix at the hardware window exactly as Phase 0 assumed
     (`01,4000-4005> A9 01`, `02,4002 8D 01 D3`). The Phase-0 `PREFIX_RE` captures
     it (window address is irrelevant to the regex). No parser change needed.
   - `.lab`: `BB<TAB>AAAA<TAB>NAME`, bank always present incl `00`. The ambiguity
     case is real and explicit — three labels at the **same** address in different
     banks: `00 4005 LOOP0` / `01 4005 LOOP1` / `02 4005 LOOP2`.
   - **`@BANK_ADD` gotcha:** `lmb`/`nmb` emit a call to a *user-supplied* `@BANK_ADD`
     macro (the load-time PORTB switch glue); without it MADS errors
     `Undeclared macro @BANK_ADD` and the XEX has no bank-switch loader. Address
     assignment + `.lst`/`.lab` capture are unaffected (so Phase-0 capture is
     verified), but a **runnable** banked XEX needs `@BANK_ADD` defined — a Step-7
     template concern, not a capture/debug concern.
   - `readMem(0xD301, 1)` on the Altirra backend (`apps/ide/src/adapters/emu/altirra.ts:156`)
     returns an owned copy via the core's Embind `readMem`. `$D301` is `$D3xx` I/O
     space (PIA, not the banked window), so it reads back the PIA PORTB output
     register = live bank bits. Live-bank read needs no new core API. (A runtime
     probe that the value actually tracks the bank after a `sta $d301` is folded
     into the Step-7 integration test — the only thing not yet exercised on a
     running core.)
   - Non-live ext-bank reads (viewer "show other bank") not probed — deferred to
     the viewer step; BP/debug path does not need it.
2. **`machine-atari-xl`: declare the banking. — DONE.** Resolved ADR open-Q1: a
   `MemorySpace` is a *flat* `[0,size)` space with no window/selector, so it can't
   model a switchable CPU window. Added a dedicated `MachinePlugin.banks:
   BankWindow[]` descriptor (`@ports/plugin-machine.ts`): CPU range + `bankCount` +
   a bus-readable `selector` (`reg`/`mask`/`shift` + optional enable gate).
   `space` stays the one debug key (ADR decision intact); `BankWindow` only
   declares *how a window projects to it*. `atari-xl` now carries
   `banks:[{ id:'main', start:0x4000, end:0x7fff, bankCount:4, spacePrefix:'bank',
   selector:{ reg:0xd301, mask:0x0c, shift:2, enableMask:0x10, enableValue:0 } }]`.
   Write-only-selector machines (NES/ZX) leave `selector` undefined — their phase
   adds a core-state path; not modelled now (no pre-empting). Typecheck clean,
   field optional so every flat machine is untouched. ADR-0014 decision 1 carries
   the refinement note.
3. **Contract: `bankMap()` + `(space, addr)` breakpoints. — DONE.** Added to
   `@ports` (`services/run-service.ts` + `plugin-debug.ts`, exported):
   - `BankBreakpoint { addr, space, offset }` — a breakpoint qualified by bank.
   - `BankProjection { window, start, end, space|null, bankOffset|null }` — one
     live window→bank entry.
   - `setBreakpoints(addrs: Iterable<number | BankBreakpoint>)` — widened. A bare
     `number` = `cpu` space (today verbatim); a `BankBreakpoint` fires only when
     its bank is live. **Method-param bivariance means every existing
     `Iterable<number>` impl satisfies the wider interface with zero edits** —
     verified: `tsc -b` clean, 550 tests green, no backend touched.
   - `bankMap?(): BankProjection[]` — optional on both `RunBackend` + `DebugTarget`;
     only banked backends implement it, flat backends omit it.
4. **Altirra backend: implement `bankMap()` + the BP hit-test. — DONE.**
   - `decodeBankWindow(w, regByte)` — pure, exported, unit-tested (5 tests, all 4
     banks + CPE gate + no-selector + default prefix). `bankMap()` reads
     `readMem(selector.reg,1)` per window and calls it.
   - `setBreakpoints` widened to `Iterable<number | BankBreakpoint>`: extracts the
     CPU `addr` from each (the C++ core traps bank-blind on PC==addr); the bank
     match is consumer-side via `bankMap()` (Step 5), not in the backend.
   - **Bank config flows app→backend, not adapter→machine.** `adapters` can't
     import `plugins` (boundary rule), so `EmulatorPlugin.createBackend(banks?)`
     was widened; `createWorkbench.resolveEmulatorBackend` passes `machine.banks`;
     `emulator.ts`/`facade.ts` forward to `AltirraBackend.create(banks)`. The
     machine stays the single source.
   - tsc clean, lint clean, 555 tests (+5). Physical-offset hit-test (map cpuPC→
     live bank, compare to BP space) lands in Step 5 where the consumer has both.
5. **`debug-service` + storage + UI hooks: thread `space`. — DONE.** Breakpoints
   stay stored as source lines (`project.breakpoints: Map<file, Set<line>>`,
   bank-agnostic at rest — ADR decision 3). The single live path is
   `project.breakpoints → useBreakpointAddrs → Emulator.setBreakpoints` (the
   `DebugService.setBreakpoint` API turned out to have **no callers** — vestigial,
   left untouched).
   - **Source map keeps banked multi-locs.** Added `SourceMap.bankedAddrToLoc:
     Map<addr, SourceLoc[]>` (every loc per addr across banks) + two pure
     resolvers in `@ports/source-map.ts`: `resolvePcLoc(sm, pc, liveSpace)` and
     `resolveLineSpace(sm, file, line)`. Both MADS + cc65 parsers populate it for
     banked entries; flat builds omit it (`addrToLoc` first-wins untouched).
   - **BP resolution** (`useBreakpointAddrs` → extracted pure `resolveBreakpoints`):
     a banked line emits a `BankBreakpoint{ addr, space }`; flat lines stay bare
     numbers (cpu, verbatim).
   - **Emulator trap loop** splits the set into cpu addrs + `bankReqByAddr`; the
     predicate fires a bank BP only when `bankMap()`'s live window space matches —
     a wrong-bank stop returns false → the rAF loop resumes (FCEUX-style).
   - **Current-line + follow-PC** (`App.pcLine`, follow-PC effect) use
     `resolvePcLoc(sm, pc, liveSpaceAt(pc))` where `liveSpaceAt` reads the
     backend's `bankMap()` — same-addr lines now highlight the live bank's line.
   - Tests: `+14` (source-map resolvers, MADS same-addr collision, flat-omits,
     `resolveBreakpoints` bank/flat/mixed). tsc + lint clean, 569 total.
   - **Not yet live-exercised**: the running-emulator "fires only on live bank" —
     that's Step 7's build→run integration test (needs the wasm core).
6. **UI: live-bank indicator + annotated gutter. — DONE.** Scoped to read-only
   indicators (non-live ext-bank reads unverified — Step 1 open item — so no
   arbitrary-bank picker yet; the dump shows the live bus, the UI names which
   bank that is):
   - **atari-6502 adapter forwards `bankMap()`** to the backend (bound to
     undefined for a flat backend, so DebugTarget.bankMap stays absent).
   - **MemoryPanel live-bank badge**: when `ctx.machine.banks` exists and `base`
     is inside a bank window, a badge shows the live bank (`bank3`), refreshed on
     the same step/bp-hit/run:state events as the dump.
   - **Editor addr-gutter bank suffix**: banked source lines render `4000 b3`
     (dim amber). New `lineBanks` StateField/effect/prop mirroring `lineAddrs`;
     App builds it via `resolveLineSpace` over the active file's emitting lines.
   - tsc + lint clean, 569 tests (UI plumbing; `resolveLineSpace` already tested).
7. **Template + integration test. — TEST DONE, TEMPLATE DEFERRED.**
   - **Integration test** (`tests/integration/atari-banking.test.ts`, +5): the
     full headless-verifiable chain — **real MADS banked build** (`opt b+` +
     `lmb #1`/`nmb`, two NOPs at the shared `$4000` in bank 1 + bank 2) → source
     map captures both via `bankedAddrToLoc` → `resolveBreakpoints` emits a
     `BankBreakpoint{addr:$4000, space:'bank2'}` → `breakpointFires` returns true
     only for the `bank2` projection (false for bank1 / no-bank) → `resolvePcLoc`
     resolves `$4000` to the right source line per live bank. The bank-match
     logic was extracted to `@ports/bank-match.ts` (`splitBreakpoints`,
     `liveSpaceAt`, `breakpointFires`) so the Emulator loop and the test share
     one implementation.
   - **Live-core test** (`tests/integration/atari-banking-live.test.ts`, +2) —
     **boots the real Altirra wasm core headless in node** (first wasm core to do
     so: a `wasmBinary` fetch shim feeds the 4.5 MB core, which can't fetch its
     own `file://` URL). A tiny program pokes PORTB's ext-bank bits; after it
     runs, `backend.bankMap()` reports the selected bank (`bank1`, then `bank3`).
     This closes the one runtime assumption code-review alone couldn't:
     **`readMem($D301)` returns the live PIA PORTB, so bankMap() tracks the
     program's bank switches on the actual core.** ~0.5 s. (Supersedes the old
     "Altirra can't boot headless" note in build-run-pipeline.)
   - **Template — DONE (runnable, real loader).** `apps/ide/templates/atari-130xe-bank/`:
     two routines at the **same `$4000`** in bank 1 + bank 2 (red/green), main
     enters bank 1 then hands off through a bank-0 trampoline to bank 2. The
     load-time bank loader is the **canonical MADS `@BANK_ADD`** (from the
     MAD-Assembler examples) in `src/bankmac.a65`, with `@TAB_MEM_BANKS` filled
     with the 130XE PORTB values (`$E3 | bank<<2`, CPE on) — mads does NOT
     auto-fill that table (the xms_banks example relies on a runtime
     `@mem_detect`; we fill it statically so the template is self-contained).
     **Enabling change:** `atariXl.hardwareConfig.memoryMode` bumped `2 → 3`
     (64K → 128K/130XE) — memoryMode 2 does **not** bank (verified); flat 64K
     programs run identically. Proven end-to-end test
     (`tests/integration/atari-130xe-template.test.ts`): builds the real
     template, boots the real core, and watches the **same `$4000` breakpoint
     resolve to bank 1 then bank 2** as execution flows between them.

### Phase 1 status — DONE (Steps 1–7, incl. runnable template)
Steps 1–6 + the Step-7 tests are merged. Bank-aware debugging works end-to-end
for Atari 130XE: capture → resolve → breakpoint match → current-line → UI
indicators, plus a **live-core test** that boots the real Altirra wasm and
confirms `bankMap()` tracks PORTB on the actual core. 576 tests, tsc + lint
clean — plus a **runnable banked template** with the real `@BANK_ADD` loader,
proven by a live-core test that catches the same `$4000` breakpoint in bank 1
then bank 2. Nothing deferred.

### Known limitations / follow-ups
- **MADS bank 0 is implicit** — its `.lst` lines carry no `BB,` prefix, so bank-0
  code is indistinguishable from flat code in the source map and resolves via
  `addrToLoc` first-wins (correct when bank 0 is the base layer; ambiguous only
  if bank-0 and a higher bank share an address AND bank 0 wasn't emitted first).
  Banks 1+ are explicit. The `.lab` carries bank for `00` too — a future parser
  could cross-reference it.
- **Non-live ext-bank reads** unverified — the memory viewer shows the live bus +
  names the bank; an arbitrary-bank picker needs Altirra non-live read support.
- **`@TAB_MEM_BANKS` filled statically** in the template (130XE PORTB values) —
  mads doesn't auto-fill it; a more portable program would runtime-`@mem_detect`.
- **cc65 130XE** banking is manual (linker config) — MADS is the Phase-1 path; the
  cc65 `.dbg` capture (Phase 0) already feeds the same `bankedAddrToLoc`.

## Phase 2 execution plan — NES mappers (the write-only-latch target)

> Validates the abstraction against a target whose bank selector is **write-only**
> (unlike Atari's bus-readable PORTB), proving the "core-state path" the BankWindow
> contract left open (`selector` undefined → backend supplies the live bank).

### Why NES is the hard second target
- **Write-only mapper latches.** UNROM (mapper 2): `write($8000+, v)` selects PRG
  bank `v` into the `$8000–$BFFF` window; `$C000–$FFFF` is the fixed last bank.
  The selector is not bus-readable — `readMem` of the latch returns ROM, not the
  bank number.
- **Multiple windows, mapper-dependent.** The window layout depends on the mapper
  (UNROM: one switchable 16K + one fixed 16K; MMC1/MMC3: more), and the bank count
  depends on the ROM — so `machine-nes.banks` declares the generic PRG windows and
  the backend reports which bank is live per window.

### Step 1 — DONE (de-risked on the real jsnes core)
Built a 2-bank UNROM ROM (MADS `opt h-`, iNES header mapper 2) and ran it on
jsnes 2.1.0. **Verified:** jsnes loads it as `UxROM`; `write($8000)` switches the
bank; **wrapping `nes.mmap.loadRomBank(bank, address)` after `loadROM` records the
live bank** (`bankAt[$8000]` tracked correctly), and `readMem($8000)` reflects it.
So the NES live-bank source is an **installed wrapper over `loadRomBank`** — no
jsnes fork, no bus read. This is the core-state path for write-only selectors.

### Steps (ordered)
2. **jsnes backend `bankMap()`. — DONE.** `JsnesBackend(banks?)` stores the
   declared windows; `loadMedia` installs the `loadRomBank` wrapper →
   `liveBankAt: Map<addr, bank>`. The mapper only exists after `loadROM` and its
   power-on mapping ran before the wrap could see it, so we **re-run the mapper's
   own `loadROM()`** with the wrap installed to capture the initial banks
   (verified idempotent). `bankMap()` projects each window from `liveBankAt`.
   `jsnes-internals.ts` now types `loadRomBank` (pinned 2.1.0). `setBreakpoints`
   widened to extract a `BankBreakpoint`'s addr (like Altirra). `createBackend(banks?)`
   threads `machine.banks` (the Phase-1 app-layer path) + `createJsnesBackend(banks?)`.
3. **NES windows are per-mapper, NOT a static declaration. — DONE.** Critical
   correction: the PRG window layout depends on the loaded mapper (UxROM: 16 KB @
   `$8000`+`$C000`; **MMC3: 8 KB @ `$8000`/`$A000`/`$C000`/`$E000`**; AxROM: 32 KB),
   decided by the iNES header at ROM-load time — so it **can't** be a static
   `machine-nes.banks`. Instead the backend wraps **both** PRG-load primitives
   (`loadRomBank` = 16 KB, `load8kRomBank` = 8 KB) and records `(window-start →
   { bank, size })`, taking the window *size* from whichever primitive the mapper
   fired. `bankMap()` derives the windows from that — mapper-agnostic, no
   hardcoded table. `machine-nes` declares **no** `banks` (the field is for
   bus-readable-fixed-window machines like Atari). The jsnes plugin ignores the
   `banks` arg.
   - **Coverage audited (jsnes 2.1.0): all 20 mappers covered.** Every mapper
     (NROM, MMC1, UxROM, CNROM, MMC3, MMC5, AxROM, MMC2, Color Dreams, BNROM,
     PCI556, GxROM, Camerica, NINA, UN1ROM, TxSROM, TQROM, Jaleco, Crazy Climber,
     240, BxROM) maps PRG-ROM **only** through `loadRomBank` (16 KB) /
     `load8kRomBank` (8 KB) / `load32kRomBank` (delegates to `loadRomBank` ×2) —
     all extend Mapper0, none writes `cpu.mem` / `copyArrayElements` into the
     `$8000+` PRG range directly. So wrapping the two primitives is exhaustive.
     **Re-audit on a jsnes version bump** (pin is 2.1.0; a new mapper could add a
     new primitive — same warning as `jsnes-internals.ts`).
4. **Live BP-trap test. — DONE.** `tests/integration/nes-banking-live.test.ts`,
   2 cases on the **real jsnes core**:
   - **UNROM (mapper 2, 16 KB):** a hand-built 3-bank ROM; the same `$8000`
     breakpoint resolves to PRG bank 0 then bank 1 as execution flows
     bank0→fixed-trampoline→bank1. Reuses the Phase-1 `@ports/bank-match.ts` engine
     + the `atari-6502` `bankMap()` forward, both unchanged.
   - **MMC3 (mapper 4, 8 KB):** a minimal ROM; `bankMap()` derives **four 8 KB
     windows** (not UNROM's two 16 KB) with no code change, and the `$8000` window
     updates live when reset switches the PRG bank. Proves the layout is derived
     from the mapper.
5. **Toolchain banked source map. — DONE.** A banked NES build tags source lines
   with banks via a **cc65 banked linker config**: a `MEMORY` area with a `bank N`
   attribute makes `ld65` emit `bank=N` on that area's segments in the `.dbg`
   (verified in the cc65 source — `segments.c` `PrintDbgSegments` writes `bank=`
   only when `MemArea->BankExpr` is set — and on real `ca65`+`ld65` output). The
   Phase-0 `parseDbg` already captures it into `bankedAddrToLoc`, and the cc65
   toolchain already returns that source map. So the **entire downstream chain is
   the unified Phase-1 path** — `resolveBreakpoints` emits a `BankBreakpoint`, the
   gutter shows the bank, `resolvePcLoc` disambiguates — with no NES-specific code.
   - **Test** `tests/integration/nes-cc65-banking.test.ts`: runs the **real
     ca65+ld65** over a banked cfg (two `CODE` segments at the same `$8000` in PRG
     banks 0 + 1, fixed bank at `$C000`); asserts the `.dbg` yields
     `bankedAddrToLoc[$8000] = [bank0, bank1]` and a source-line breakpoint
     resolves to `BankBreakpoint{$8000, bank1}` (and bank0 for the other line).
     `parseDbg` is now exported from `@madside/toolchain-ca65`.
   - **Bank-number alignment is the cfg author's job.** The cfg's `bank N` must
     equal the PRG bank index the program selects at run time (so the source map's
     `bank{N}` matches the live `bankMap()` `bank{N}`). For UxROM that's automatic
     (writing N to `$8000` → `loadRomBank(N)`); for an 8 KB mapper the cfg must use
     8 KB banks to match. MADS has no NES multi-bank mode, so cc65 is the NES path.
6. **Runnable template + joined live test. — DONE.**
   - **Template** `apps/ide/templates/nes-banking/` (cc65, UxROM): two routines at
     the same `$8000` in PRG bank 0 + 1 (blue/green), `reset` (fixed `$C000` bank)
     enters bank 0 then trampolines to bank 1. `project.json` points
     `build.options.config` at the banked `src/banked.cfg`. Verified the madside
     cc65 toolchain path: a project-relative `config` is passed to `ld65 -C`, and
     linking the always-included `nes.lib` is a no-op for the self-contained asm.
   - **Joined gold test** `tests/integration/nes-banking-template.test.ts`: builds
     the **actual template** with real ca65+ld65, then runs the ROM on the **real
     jsnes core**, and asserts the editor side (cc65 `.dbg` bank tags) and the
     runtime side (jsnes `bankMap()`) **agree** — the source line resolved for the
     live bank is `b0Line` at the first `$8000` stop (bank 0) and `b1Line` at the
     second (bank 1). Both halves of NES banking proven on real tools + core, end
     to end.

### Risks / open questions to resolve in Phase 1
- **OPT B+ window capture** — verify step 1 (the `$4000` hardware path, not just `lmb`).
- **`space` overload vs `banks` field** — ADR-0014 open question 1; decide when wiring step 2/3.
- **Non-live bank reads** — Altirra core support for the viewer's "other bank"; BP doesn't need it.
- **cc65 130XE** — leave manual/secondary; MADS is the Phase-1 path.

### Change surface (from the audit, §"What's already true in the code")
`@ports`: `source-map.ts` (done, Phase 0), `services/run-service.ts` (RunBackend +
`bankMap` + `setBreakpoints` space), `plugin-debug.ts` (DebugTarget). `workbench-core/
debug-service.ts` (breakpoint set + sync). `apps/ide/src/adapters/emu/altirra.ts`
(bankMap + hit-test). `debug-atari-6502` adapter (forward space, stop masking ext
window). `useBreakpointAddrs`/`useRunControls`/`useCursorMemory`/`useProjectLabels`/
Editor gutter/MemoryPanel (thread space). `toolchain-mads` (already captures; may
add the in-bank offset compute). Storage stays line-based.

### Verified facts to carry into Phase 1
- Altirra backend has `core.readMem(addr, len)`; `$D301` is bus-readable → live bank
  needs no new core API.
- MADS `.lst` bank format: `BB,AAAA` (bank≠0), plain `AAAA` (bank 0). `.lab`:
  `BB<TAB>AAAA<TAB>NAME` (bank always, incl `00`). Phase 0 captures the `.lst` form.
- cc65 `.dbg` `seg` carries `bank` + `ooffs` (Phase 0 captures both).
- 130XE: window `$4000–$7FFF`, 4 banks, PORTB `$D301` bits 2–3 (+CPE bit 4 / VBE bit 5).

## Phase 3 — ZX Spectrum 128K (second write-only-latch target)

### Runtime — DONE (verified on the real chips core)
`$7FFD` is a write-only paging latch (bits 0-2 = one of 8 RAM banks paged into
`$C000–$FFFF`), **absent on the 48K** (writes do nothing) — so 128K is a
**separate machine** (`zx128`, `ZX_TYPE_128`), not a 48K config: a 48K title that
hits `$7FFD` would page/crash on a 128K, and +2A/+3 contention differs. The chips
`zx-core` wasm was rebuilt to support both (`init` 48K / `init128` 128K + 2 ROMs)
plus a `getMemConfig()` getter exposing `zx.h`'s tracked `last_mem_config` (the
write-only latch — same core-state pattern as the NES). `machine-zx128` declares
the `$C000` / 8-bank window (selector omitted); the backend's `bankMap()` reads
`getMemConfig() & 7`. Live test `zx128-banking-live.test.ts`. Reuses the unified
contract + the zx-z80 adapter's `bankMap()` forward.

### Editor-side (source map) — BLOCKED on a prerequisite, bigger than NES
Verified by running the real z80asm:
- **z80asm CAN emit debug info**: `-l` (list) gives `line  offset  bytes` per source
  line (offset within its SECTION; absolute = section `org` + offset); `-m` (map)
  gives `symbol = addr ; addr, …, <section>, file:line`. So a SourceMap is
  buildable from `-l`/`-m`.
- **But madside's z88dk toolchain runs only `z80asm -b`** (binary) — it returns
  **no `sourceMap` at all**. ZX has **zero source-level debugging today** (the
  `#87` debt): no gutter addresses, no set-BP-from-source, no current-line. So
  there is no foundation to add bank tags to (unlike NES, where cc65's `.dbg`
  gave line→addr + native `bank=` for free).
- **z80asm has no native bank field** (no cc65-style `bank=`). It has named
  SECTIONS (address-only); a 128K "bank" is a *convention* (which section maps to
  which `$7FFD` bank). So bank-tagging needs a section→bank mapping we define.

**Therefore parity is a two-step build:**
1. **z88dk source-level debugging (#87 prerequisite, = ZX48 + ZX128 parity).** Run
   `z80asm -l -m`, parse the list (`line offset bytes` + section `org`) → `SourceMap`
   (line↔addr), parse the map for labels. Gives both 48K and 128K the same
   source-level debug as Atari/NES (gutter, BP-from-source, current-line). NO
   banking yet.
2. **ZX128 section→bank convention.** Tag a banked section's lines with its bank
   (e.g. a `SECTION BANK_n` naming convention or a project-declared section→bank
   map) → fold into the source map's `bankedAddrToLoc`, then the unified Phase-1
   path takes over (`resolveBreakpoints` → `BankBreakpoint`, gutter, `resolvePcLoc`).

## Sources

Per-target hardware: atariarchives.org / Altirra (PORTB), nesdev.org wiki
(mappers/iNES), c64-wiki + codebase64 (`$01`/PLA), worldofspectrum (`$7FFD`),
Sega Technical Overview + Plutiedev (SSF2 / Z80 window). Prior art: Mesen,
FCEUX, MAME, Ghidra (overlay spaces), VICE, Altirra, openMSX, BizHawk docs +
source; toolchain formats: cc65 `ld65` source (segments/span/lineinfo), WLA-DX
symbols, MADS `.lab`/`.lst`, z88dk map/sections. Full citations in the research
threads behind this doc.
