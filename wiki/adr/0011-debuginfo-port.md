# ADR-0011: Toolchain-supplied, language-agnostic DebugInfo

- **Status:** Accepted
- **Date:** 2026-06-22
- **Deciders:** Mikołaj
- **Tags:** architecture, debug, plugins, types, scalability

## Context

The Variables panel (epic #121) phase 1 ships a flat list of global symbols +
their live raw value. It reads the assembled symbol table —
`ToolchainBuildOutput.labels: Map<name, address>` — which every toolchain
(MADS / cc65 / z88dk) already emits, and `DebugService.readMemory`. It is
machine- and language-agnostic by construction: the panel knows nothing about C.

Phase 2 wants the debugger-style **tree**: expand a `struct`, an array, a
pointer; decode a value by its type. That needs **types**, which `labels`
doesn't carry. The architectural question is *where types live* — because the
answer decides whether the debugger scales to other machines and languages, or
quietly becomes C-only.

Two forces frame the decision:

- **The agnostic-core precedent (ADR-0009).** Editor intelligence is a
  language-neutral core (`@madside/lsp-core`) with per-dialect engines behind a
  `LanguageProvider` contract. The debug view should follow the same shape, not
  reach into a specific language package.
- **The 16-bit-bus audit (#88 → #133/#134).** The generic address seam assumes a
  flat 16-bit space. A type model that bakes 16-bit addresses + a single space in
  now would add to that debt. The contract must be address-space- and
  width-aware from the start, even though the four current machines are all ≤64K.

The toolchain is already the owner of the debug build artifacts (`sourceMap`,
`labels`) — it is the thing that parses `.dbg` / `.map` / `.sym`. So growing
*that* artifact is the natural move; the open choice is the shape + who joins
types to addresses.

## Decision drivers

- **Scales to other machines + languages.** Adding a language (BASIC, Rust,
  another C dialect) or a machine must not touch the panel — it supplies its own
  debug info, like a `LanguageProvider` supplies its own intelligence.
- **Panel stays language-neutral.** `panel-variables` + the value decoder read a
  generic typed-symbol model, never import `@madside/lsp-c`.
- **Toolchain owns the join.** Addresses come from the toolchain (`.dbg`/`.map`);
  types come from the C engine. The join belongs where the addresses already
  live — the toolchain — not the app/ui.
- **Forward-compatible with #88.** Locations are address-space/bank-aware;
  scalars carry width + endianness. Current 16-bit machines default cleanly.
- **Frames-ready.** The shape must let "symbols in scope at PC / per frame"
  (phase 3, #131) slot in without a redesign.

## Considered options

1. **Panel joins `lsp-c` types with `labels` at runtime.** The panel/app imports
   the C engine, asks it for a symbol's type, joins with the address. Rejected:
   couples the debug panel to C + `@madside/lsp-c`, breaks the agnostic-core
   thesis (ADR-0009), and pushes language specifics up into ui.
2. **Types only from cc65 `.dbg`.** Use whatever type info the debug dump
   carries. Rejected: `.dbg` type info is partial (cc65 emits limited C type
   detail), z88dk's `.map` carries none, and it wouldn't generalise to other
   languages — each would need bespoke panel code.
3. **A toolchain-supplied, language-agnostic `DebugInfo` artifact (chosen).**
   Grow `ToolchainBuildOutput.labels` into a richer `DebugInfo` (typed symbols +
   a type model). The toolchain populates it — joining its own addresses with
   types from whatever source fits (cc65/z88dk reuse `@madside/lsp-c` behind the
   port, #129). The panel + decoder consume the generic model.
4. **A separate runtime "debug type service" in the app** that composes sources.
   Rejected: the toolchain already owns the address artifacts at build time, so
   the join is a build concern, not an app-layer service; a service would re-leak
   language specifics into the host.

## Decision outcome

Adopt option 3 — **debug type information is a toolchain-supplied,
language-agnostic `DebugInfo` artifact**, an extension of the existing
build-output `labels`/`sourceMap`, consumed by a generic decoder + the Variables
panel.

Shape (a contract in `@ports`; exact names settled in implementation):

```
DebugInfo            // grows out of ToolchainBuildOutput.labels
  symbols: Symbol[]  // typed globals now; scoped/frame symbols later (#131)

Symbol  = { name; location: Location; type: TypeRef }
Location= { addr: number; space?: string }   // space = the #88 seam; omitted = the single CPU space
TypeRef = id into a type table (shared, so recursive types + reuse work)

Type (language-neutral kinds):
  | { kind:'scalar';  bytes; signed; endian:'le'|'be'; repr:'int'|'char'|'bool'|'float' }
  | { kind:'pointer'; to: TypeRef }
  | { kind:'array';   of: TypeRef; count }
  | { kind:'struct'|'union'; fields: { name; offset; type: TypeRef }[] }
  | { kind:'enum';    base: TypeRef; members: { name; value }[] }
```

Rules, restated so they can't drift:

> **The panel never imports a language package.** `panel-variables` and the value
> decoder read `DebugInfo` only. A language/toolchain that wants the tree fills
> the port; nothing else changes. (Mirrors ADR-0009: agnostic consumer, provider
> behind a contract.)
>
> **The toolchain owns the join.** It produces `DebugInfo` at build time by
> joining its addresses with types from a source of its choice. For C, the
> cc65/z88dk toolchains reuse `@madside/lsp-c`'s type introspection (#129) — an
> implementation detail behind the port.
>
> **Locations are address-space-aware, types carry width + endianness.** No bare
> 16-bit assumption enters the contract (#88A/#133). Current machines use one
> space + LE 8/16-bit; a future 68000/banked target supplies its own without a
> contract change.

The **decoder** (`(bytes, Type) → rendered value + child nodes`) is generic and
lives with the panel: scalars decode by width/sign/endian; struct/union yield a
child per field at `location + offset`; arrays yield elements (lazy, capped);
pointers yield the value + a deref child at the target location. Children are
fetched lazily on expand, with depth/visited guards for pointer cycles.

Scope: **C first** (cc65, then z88dk). Asm and any untyped symbol keep phase-1's
raw byte/word render — they simply have no `type`, so the decoder shows them flat.

Rollout:

1. This ADR — the `DebugInfo` port + decoder contract.
2. #129 — `@madside/lsp-c` type introspection; the C toolchains fill the port.
3. #130 — the generic decoder + expandable tree in `panel-variables`.
4. The address seam touched here is made space-aware as part of #133 (88A).
5. Phase 3 (#131/#132) — scoped/frame symbols + watch, slotting into the same
   `Symbol`/`Type` model.

## Consequences

**Positive**

- The debugger scales like the LSP core: a new language/machine supplies
  `DebugInfo`, the panel + decoder are untouched.
- No `panel → lsp-c` coupling; language specifics stay behind the toolchain.
- The address-space/width-aware contract stops the 16-bit debt from growing
  (#88A) and leaves a clean path to >64K/banking (#88B) without a repaint.
- Types flow through the same toolchain-owned channel as `sourceMap`/`labels`,
  so there's one debug-info pipeline, not a parallel one.

**Negative / risks**

- The toolchain now does a build-time type↔address join (more work in the
  cc65/z88dk build path). Mitigation: it reuses the existing `@madside/lsp-c`
  parser; the join is address-keyed and mechanical.
- A shared type table + recursive `TypeRef`s add a little indirection vs inlining
  types per symbol — needed for pointer/struct recursion + reuse.
- C-first means asm stays raw indefinitely; acceptable (asm has no types).
- Endianness/width must be sourced correctly per dialect/target; a wrong width
  mis-decodes silently. Mitigation: the toolchain (which knows its target) sets
  them, not the panel.

Relates to ADR-0009 (agnostic core ← provider — the precedent), ADR-0001 (plugin
workbench), ADR-0002 (layering — toolchain owns build artifacts, ui consumes).
Implements epic #121 phase 2; coordinates with #88/#133 (address seam). Children:
#129 (provider), #130 (decoder + UI).
