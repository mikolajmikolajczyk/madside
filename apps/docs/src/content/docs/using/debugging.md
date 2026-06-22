---
title: Debugging
description: Breakpoints, stepping, registers, flags, and the memory viewer.
sidebar:
  order: 5
---

madside debugs at the source level: breakpoints are set on source lines, the editor highlights the current instruction, and the [registers, memory, and variables panels](/docs/using/panels/) update whenever the emulator stops.

:::note
Source-level debugging relies on the [source map](/docs/using/building/#the-source-map-and-labels). The **mads** toolchain emits it for assembly, and **cc65** emits it for C and ca65 (its `.dbg` maps `.c` lines to addresses) — so you can set breakpoints and step on C source lines. The **z88dk** (ZX Spectrum) toolchain doesn't emit source debug info yet, so ZX projects debug at the machine level only (emulator, registers, memory, and stepping still work).
:::

## Breakpoints

Set a breakpoint by clicking the breakpoint gutter next to a line, or with **F9** at the cursor. **Run → Clear all breakpoints** removes them all at once.

Breakpoints are stored per file (path-aware) and survive re-assembles and reloads. After a build, each breakpoint line resolves through the [source map](/docs/using/building/#the-source-map-and-labels) to a machine address. When the running emulator's program counter reaches one of those addresses, it traps: the emulator pauses, the editor highlights the line, and the panels refresh. The status bar shows the address you broke on.

## Step instruction vs step frame

Both are available only while the emulator is paused:

- **Step** (F10) advances exactly one CPU instruction.
- **Frame** (F11) advances one full display frame.

Frame temporarily ignores breakpoints while it advances, so it always completes a real frame even when you're paused on a breakpoint. Stepping repaints the emulator screen and refreshes the panels each time.

## Registers and flags

The **Registers** panel lists the CPU's registers and condition flags. The exact set comes from the active machine's debug adapter — for the 6502 machines (Atari, NES, C64) that's A / X / Y / PC / SP plus the processor-status flags; for the ZX Spectrum it's the Z80 set (PC / SP / AF / BC / DE / HL / IX / IY / IR plus the shadow registers). The panel renders correctly for whichever machine the project targets. Values update on every step, frame, and breakpoint hit.

## Variables

The **Variables** panel inspects program data. For a **C** build the toolchain ships a typed-symbol model, so each global appears with its type and a decoded live value — and aggregates expand into a tree:

- **scalars** decode by width, sign, and endianness (`int`, `char` shows its code + glyph, `bool`);
- **pointers** show their target address and deref one level on expand;
- **structs / unions** expand to a child row per field at the right offset;
- **arrays** expand to their elements (lazily, capped for huge arrays).

Add a **watch expression** in the panel's input — `pos.x`, `*ptr`, `arr[3]`, `p->next->v`, `**pp` — and it's evaluated against the typed model + live memory, re-read on every step / pause. Watches persist per project.

Assembly builds (or any build with no type info) fall back to a flat list of symbols with their raw byte / word values.

:::note
**Locals** (function-scope variables) aren't shown yet. cc65's frameless software stack makes a local's runtime address unrecoverable from the debug info at an arbitrary stop; the reliable path is the z80 frame-pointer ABI, tracked for a future release. Globals + watch expressions cover most inspection in the meantime.
:::

## The memory viewer

The **Memory** panel shows a hex + ASCII dump. Type a hex address into the **Memory @** field to jump anywhere; the view re-reads on each step, frame, and pause.

By default the view *follows* — it tracks the load address of the freshly built binary and the file you're editing. Once you type an address manually it stops following; click the **↺ follow cursor** badge to re-engage automatic following.

Rows are annotated with the machine's named memory regions (from the machine's memory map) on hover.

### Named memory spaces

Machines with more than one address space declare them in the machine plugin, and viewer panels read them by id. The NES, for example, exposes its CPU bus plus a **PPU VRAM** space and an **OAM** space — these feed the [PPU viewer](/docs/using/panels/#machine-specific-panels). The default Memory panel reads the CPU bus.
