# ADR-0012: Stack-frame model for locals in DebugInfo

- **Status:** Accepted (contract); cc65 locals **deferred — blocked by ABI**, see *Postscript*
- **Date:** 2026-06-22
- **Deciders:** Mikołaj
- **Tags:** architecture, debug, plugins, abi, scalability

## Context

The Variables panel (epic #121) shows **globals**: typed symbols at fixed
addresses (ADR-0011 `DebugInfo.symbols`, types joined from `@madside/lsp-c`).
Phase 3 (#131) wants **locals of the current stack frame** — variables that don't
live at a fixed address but at an offset from a per-call frame base.

This is the ABI-specific part the epic flagged. A local's address is computed,
not stored, and *how* it's computed differs sharply per toolchain:

- **cc65 (6502).** C autos live on a **software stack** addressed through a
  zeropage pointer (`c_sp`, a 16-bit word). `local addr = read_word(c_sp) +
  offset`. The `.dbg` carries `csym` records (`name`, `sc=auto`, `offs`) grouped
  by `scope` (the function), but **no C type** (`type=0`) — types must still come
  from `@madside/lsp-c`, exactly like globals. `c_sp`'s address is in the `.dbg`
  as a `lab` sym (atari: `$0082`) — already parsed into `labels`.
- **sccz80 (z80).** C frames are **IX-relative** (a CPU register, not a memory
  pointer). `local addr = IX + offset`. z88dk has **no source-level debug at all
  today** (no line map, no labels — issue #135), so this path is unimplementable
  until that foundation lands.

Grounded by a probe: compiling a C function with locals through the in-repo cc65
wasm, then inspecting the linked `.dbg`:

```
csym  id=1,name="a",scope=1,type=0,sc=auto,offs=2
csym  id=2,name="b",scope=1,type=0,sc=auto            # offs omitted ⇒ 0
csym  id=3,name="sum",scope=1,type=0,sc=auto,offs=-2
scope id=1,name="_add",type=scope,size=27,parent=0
sym   id=…,name="c_sp",addrsize=zeropage,size=2,val=0x82,type=lab
```

Codegen reads `a` (offs=2) as `ldy #$02; lda (c_sp),y` — confirming the offset is
relative to the **live** `c_sp` at line boundaries (where the debugger stops).

ADR-0011 already promised this would "slot in without a redesign" and left
`DebugInfo` open for "scoped/frame symbols". This ADR fixes the shape.

## Decision drivers

- **Stay language/machine-neutral in the panel** (ADR-0011 rule): `panel-variables`
  must not learn cc65 vs sccz80. The frame mechanism is data, not panel code.
- **Toolchain owns the join** (ADR-0011): the toolchain produces frames at build
  time, joining `.dbg` offsets with `@madside/lsp-c` types — same pipeline as
  globals, not a parallel one.
- **Both ABIs expressible now**, even though only cc65 is populated: memory-pointer
  frames (cc65 `c_sp`) *and* register frames (sccz80 `IX`).
- **Current frame only.** Showing the innermost frame's locals needs only the live
  frame base + offsets — no stack unwinding. Full unwind (outer frames, a frame
  picker) needs each frame's *saved* base, which is more ABI work for less value;
  defer it.
- **Reuse the existing decoder.** A local is "a typed value at an address" once its
  base is resolved — it must render through the same `VarRow` tree as a global
  (struct/array/pointer expansion), no new rendering path.

## Considered options

1. **Bake cc65's `c_sp` into the panel.** Panel reads zeropage `$82`, adds offset.
   Rejected: hardcodes one ABI in the neutral consumer; sccz80 (IX) and any future
   target would each need panel edits — the exact coupling ADR-0009/0011 forbid.
2. **Frame base as a single number the toolchain pre-resolves.** The toolchain
   can't — the base is a *runtime* value (the live `c_sp` / `IX`), unknown at build
   time. Rejected: impossible.
3. **A generic `DebugFrame` descriptor the panel resolves at runtime (chosen).**
   The toolchain emits *how* to find the base (`memptr` at an address, or a named
   `reg`); the panel reads it live via the debug port (`readMemory` /
   `readRegisters`, both already present). Locals are `{name, offset, type}`,
   grouped per `DebugScope` with a PC range.
4. **Full call-stack unwinding now.** Walk return addresses, model every frame.
   Rejected for v1: large ABI surface (6502 software-stack + hardware-stack
   interplay; z80 IX chains), and the panel value is mostly the current frame.
   Deferred behind a separate issue.

## Decision outcome

Adopt option 3 — **a generic `DebugFrame` + `DebugScope` in `DebugInfo`,
resolved at runtime by the panel through the existing debug port.**

Shape (in `@ports/debug-info.ts`, extending ADR-0011):

```ts
type DebugFrame =
  | { kind: 'memptr'; addr: number; bytes: number; endian: 'le'|'be'; space?: string }
  | { kind: 'reg';    reg: string }

interface DebugLocal { name: string; offset: number; type: DebugType }

interface DebugScope {
  name: string                          // C function, demangled
  pc: { start: number; end: number }    // half-open; active range
  frame: DebugFrame
  locals: DebugLocal[]
}

interface DebugInfo { symbols: DebugSymbol[]; scopes?: DebugScope[] }
```

Resolution (panel, generic):

1. `pc = ctx.debug.target().getPC()`.
2. Pick the scope whose `pc` range contains `pc` (innermost wins if nested).
3. Resolve the frame base: `memptr` → `read_word(addr)` via `readMemory`; `reg` →
   `readRegisters()[reg]`.
4. Each local renders at `base + offset` through the **same `VarRow` tree** as a
   global.

cc65 mapping (toolchain-ca65, build time):

- Parse `.dbg` `scope` (function name + size) + `csym` (`sc=auto` → `name`, `offs`;
  omitted `offs` = 0). Scope PC range = `[labels[scopeName], + size)`.
- Type per local: `@madside/lsp-c` function-local introspection (#131), joined by
  name — `.dbg` has none (`type=0`).
- `frame = { kind:'memptr', addr: labels['c_sp'], bytes: 2, endian: 'le' }`.

Rules, restated so they can't drift:

> **The panel resolves frames generically.** It reads `DebugFrame` + reads
> memory/registers through the debug port. It never branches on cc65 vs sccz80.
>
> **The toolchain owns the frame join.** It emits `DebugScope[]` at build time,
> joining `.dbg` offsets with `lsp-c` types — the same place globals are joined.
>
> **Current frame only.** v1 shows the innermost frame (live base, no unwind).
> Outer frames + a frame picker are deferred.

Scope: the **contract + the parsing/introspection foundation** land now
(`DebugFrame`/`DebugScope`/`DebugLocal` in `@ports`, cc65 `.dbg` `scope`/`csym`
parsing in `parseDbg`, `functionLocals` in `@madside/lsp-c`). **Populating
`DebugInfo.scopes` is deferred** — cc65 turned out not to support reliable local
resolution (see *Postscript*), and the first target that does (sccz80 IX) is
gated on z88dk source-level debug (#135). asm + untyped builds emit no `scopes`
regardless (locals need types); they keep the globals/raw view.

## Consequences

**Positive**

- Locals scale like globals + the LSP core: a new ABI supplies a `DebugFrame`
  kind (or reuses `memptr`/`reg`); the panel is untouched.
- No `panel → cc65` coupling; the ABI lives in the toolchain + a data descriptor.
- One debug-info pipeline (offsets + types joined at build time) — not a parallel
  runtime service.
- Register-frame support is in the contract now, so z80 (#135 → #131-z80) is a
  populate-only change, no contract repaint.

**Negative / risks**

- **Current-frame-only** means no call-stack view yet; acceptable for v1, tracked
  as a deferred follow-up.
- cc65 offsets are valid at **line boundaries** (steady-state `c_sp`); reading
  mid-instruction or mid-call-setup could mis-resolve. Mitigation: the panel reads
  on pause/step events (line boundaries), as it already does for globals.
- A wrong `c_sp` address or offset sign mis-decodes silently. Mitigation: both come
  from the `.dbg` (target-authored), not guessed; covered by parser tests against
  the probe's real `.dbg`.
- Block-nested scopes (cc65 emits unnamed child scopes) are folded into the
  function scope in v1; shadowed block locals are an edge case, deferred.

## Postscript — cc65 locals are not reliably resolvable (verification finding)

Implementing the cc65 mapping above, a probe through the in-repo cc65 wasm (real
compile + link + `.dbg`, then inspecting codegen) showed the `c_sp + offs` model
is **unsound for cc65 under `-O`**, so cc65 locals are deferred — the contract
ships, the cc65 *populate* does not.

Why it fails:

- **cc65 has no frame pointer.** Locals live on a software stack addressed
  directly through `c_sp`, which **moves within a function** as locals are
  pushed/popped incrementally. Verified: in `compute` the whole frame is bulk
  allocated in the prologue (`decsp6`/`push0`) so `c_sp` is stable — the model
  works; in `add`, `int sum` is pushed *inline at its own line*, so `c_sp` at the
  declaration line differs from `c_sp` two lines later. A local's live address
  therefore depends on the PC.
- **The `.dbg` offset is relative to a fixed compile-time frame register**, but
  the live `c_sp` equals that register only at some PCs. The per-PC displacement
  (cc65's internal `StackPtr`) is **not recorded in dbginfo**, and there's no flag
  to tell a "fully hoisted" function from an "incremental push" one — so
  `c_sp + offs` is silently wrong for a subset of locals, with no way to detect
  which. Shipping it would be exactly the kind of quietly-wrong debugger value
  this project avoids.
- **`-Cl` (static locals) is not an escape.** It gives body locals fixed
  addresses, but cc65 then emits **no `.dbg` record** for them (only an internal
  `Mxxxx` label) — the name→address mapping is gone. Worse, not better.

What stays (the foundation, deliberately kept):

- The `@ports` contract (`DebugFrame` `memptr`/`reg`, `DebugScope`, `DebugLocal`).
- `parseDbg` → `scopes` (cc65 `scope`/`csym` extraction; the offsets are correct
  *data* — only their runtime *resolution* is unsound on cc65).
- `functionLocals` in `@madside/lsp-c` (dialect-neutral; reused by the z80 path).
- `buildCc65DebugInfo` deliberately does **not** emit `DebugInfo.scopes`; the
  Variables panel renders no Locals section. No unreliable artifact reaches a
  consumer.

The irony that reframes the roadmap: **sccz80 (z80) uses `IX` as a true frame
pointer** — set once in the prologue, stable across the body. The `reg`-based
`DebugFrame` resolves cleanly there, so **z80 becomes the first reliable locals
implementation**, gated on z88dk source-level debug (#135) and tracked as the z80
continuation of #131.

Relates to ADR-0011 (DebugInfo port — this fills its frame-ready promise),
ADR-0009 (agnostic core ← provider), ADR-0002 (toolchain owns build artifacts).
Lands the frame contract + foundation for epic #121 phase 3 (#131); cc65 locals
deferred (ABI); z80 locals are the live path, gated on #135.
