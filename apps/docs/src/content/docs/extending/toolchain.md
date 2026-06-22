---
title: Toolchain plugins
description: The assemble contract — build input/output, source map, labels, editor language.
sidebar:
  order: 7
---

A **toolchain plugin** wraps an assembler or compiler so `BuildService` stays machine-agnostic. The build is dispatched by the project's `manifest.toolchain` id. Three reference impls ship: MADS (`packages/toolchain-mads/`, 6502 assembly), cc65 (`packages/toolchain-ca65/`, C + ca65 + ld65 for NES / Atari / C64), and z88dk (`packages/toolchain-z88dk/`, C + z80asm for the ZX Spectrum).

Toolchain plugins are **built-in only**. The wasm tools run over WASI on the page (no worker — main-thread per ADR-0003), so keep `build` pure (no DOM access).

## The contract

Source: `@ports/plugin-toolchain.ts`.

```ts
interface ToolchainPlugin {
  readonly id: string                  // 'mads', 'cc65'
  readonly name: string
  readonly inputExt: readonly string[] // source extensions, no dot: ['a65', 'asm', 'inc']
  readonly outputExt: string           // binary extension, no dot: 'xex' | 'nes' | 'prg'
  readonly language?: ToolchainLanguage // optional editor-language metadata
  build(input: ToolchainBuildInput): Promise<ToolchainBuildOutput>
  sysroot?(machine?: string): VfsProvider | undefined // optional read-only bundled runtime
}
```

## The assemble contract

```ts
interface ToolchainBuildInput {
  projectId: string
  main: string                 // entry-point file path
  files: { path: string; content: Uint8Array }[]  // every file the build might need
  options?: Record<string, unknown>               // forwarded from the manifest
  machine?: string             // active machine id (manifest.machine) — multi-target maps it to its target + sysroot
}

interface ToolchainBuildOutput {
  ok: boolean
  binary?: Uint8Array          // absent on failure
  stdout: string
  stderr: string
  sourceMap?: SourceMap        // pre-parsed (see below)
  labels?: Map<string, number> // pre-parsed name → address
  debugInfo?: DebugInfo        // optional typed-symbol model (see below)
  extras?: Record<string, unknown>  // pass-through (raw listing text, etc.)
  exitCode: number             // 0 on success; non-zero on failure (contract)
}
```

`files` carries every file the toolchain might need — sources, includes, generated asset overlays. Your plugin filters by its own `inputExt`. Build the entry point named by `main` and return the binary.

**The plugin owns parsing.** The workbench never reads raw `.lst` / `.lab` / `.sym` text — you pre-parse into `sourceMap` + `labels` and the UI consumes those directly.

### `debugInfo` — typed symbols for the Variables panel

`labels` alone (name → address) drives the flat Variables view. To get the
**typed** view — globals decoded by type, expandable `struct` / array / pointer
trees — emit the optional `DebugInfo` model (`@ports`):

```ts
interface DebugInfo {
  symbols: DebugSymbol[]   // { name, location: { addr }, type: DebugType }
}
// DebugType is language-neutral: scalar (bytes/signed/endian/repr) |
// pointer | array | struct | union | enum | unknown.
```

It is **language-agnostic by design** (ADR-0011): the Variables panel reads this
model and never imports your language package. The toolchain owns the join — it
pairs its own symbol addresses with types from whatever source fits. The cc65
toolchain, for example, joins `.dbg` addresses with C types resolved by the in-repo
`@madside/lsp-c` engine. Omit `debugInfo` and the panel falls back to the flat
`labels` view; emit it and globals become a typed tree. (A frame/locals contract
exists too — `DebugFrame` / `DebugScope` — but populating locals needs a real frame
pointer, so it's not wired for the frameless cc65 ABI yet.)

## Hello-world

```ts
import type { ToolchainPlugin } from '@ports'

export const echoToolchain: ToolchainPlugin = {
  id: 'echo',
  name: 'Echo Toolchain',
  inputExt: ['txt'],
  outputExt: 'bin',
  async build(input) {
    const main = input.files.find((f) => f.path === input.main)
    if (!main) {
      return { ok: false, stdout: '', stderr: `main missing: ${input.main}`, exitCode: 1 }
    }
    return {
      ok: true,
      binary: main.content,
      stdout: `echoed ${main.content.byteLength} bytes\n`,
      stderr: '',
      exitCode: 0,
    }
  },
}
```

```jsonc
{ "version": 2, "toolchain": "echo", "main": "src/hello.txt" }
```

## Source map and labels

Toolchains that emit a per-line listing should pre-parse it into a `SourceMap` (`@ports/source-map.ts`) so the editor's PC marker and breakpoint gutter work for free. A `SourceMap` carries two `Map`s — `addrToLoc` and `locToAddr` — bridging addresses and `{ path, line }` locations. (MADS walks `icl` directives so `src/main.a65` and `lib/main.a65` resolve independently.)

Likewise, parse a label/symbol dump into `labels: Map<string, number>` (name → address) so the symbol browser and label features light up. The workbench never sees the raw `.lab` text.

## The `language` field

`language` carries the assembler-specific editor vocabulary (epic-tracked). It's declarative and editor-library-agnostic — the editor pairs it with the machine CPU's opcode set to drive highlight / hover / autocomplete:

```ts
language: {
  directives: ['ORG', 'DTA', 'ICL', 'OPT'],   // uppercase, no prefix; highlighted + skipped by the label scanner
  lineComment: ';',                            // or [';', '//']
  snippets: [
    { label: 'loop', detail: 'counted loop', template: 'ldx #${1:count}\n${2}\n  dex\n  bne *-1' },
  ],
}
```

The 6502 *opcodes* come from the machine's CPU; `language` carries only what's assembler-specific. A toolchain without `language` falls back to plain text. `snippets` use CodeMirror's `${n:placeholder}` template syntax but the contract itself doesn't depend on CodeMirror.

### C library symbols (`cSymbols`)

A toolchain that compiles C (cc65) can also offer its standard-library surface for autocomplete + hover in `.c` / `.h` sources via `language.cSymbols`:

```ts
interface ToolchainCSymbol {
  label: string     // identifier as typed, e.g. 'cputs'
  detail?: string   // one-line signature shown beside the completion, e.g. 'void cputs(const char*)'
  info?: string     // longer hover/info text
  header?: string   // declaring header, e.g. 'conio.h' — auto-`#include`d when the completion is accepted
}

language: {
  // ...directives / lineComment / snippets as above...
  cSymbols: [
    { label: 'cputs', header: 'conio.h', detail: 'void cputs(const char* s)', info: 'Output a string at the cursor.' },
    { label: 'memcpy', header: 'string.h', detail: 'void* memcpy(void* dst, const void* src, size_t n)' },
  ],
}
```

`cSymbols` is declarative — like the rest of `language`, no CodeMirror dependency. When the user accepts a completion, the editor auto-`#include`s the symbol's `header` so they learn where it comes from. It's a curated surface (the common console + stdlib calls), not full clangd-style analysis. cc65 ships its set in `cc65-symbols.ts`.

## Build options forwarding

A project's `manifest.build.options` (a free-form `Record<string, unknown>`) is forwarded verbatim into `build` as `input.options`. The manifest stays toolchain-agnostic — it never interprets the bag — so **your plugin owns and validates its own keys** at build time, and documents them in its own docs. (MADS reads `options.args`; cc65 reads `options.config` + `options.cc65Args` / `ca65Args` / `ld65Args`. A legacy top-level `manifest.build.args` folds into `options.args` for back-compat.) `BuildService` calls your `build` with `projectId`, `main`, `files`, `machine`, and these `options`.

## Sysroot and the build filesystem

Most assemblers (MADS) build from project files alone. A compiler with a bundled runtime — cc65 ships `include/` + `asminc/` headers, `lib/<target>.lib`, and a linker config — needs those files present in the build filesystem too. Declare them as a **sysroot**:

```ts
sysroot?(machine?: string): VfsProvider | undefined
```

It returns a read-only [`VfsProvider`](/docs/) from the VFS layer ([ADR-0008](https://github.com/mikolajmikolajczyk/madside), `@core/vfs`) — a lazily-yielded file tree (`read` / `list` / `stat`). The same provider drives **both** sides:

- **The build** — the toolchain assembles its build filesystem by composing the project sources with the sysroot through the VFS, and a single bridge materialises that into the WASI preopen the wasm tools see. You don't hand-roll `placeFile` / `mkdirP` anymore.
- **The file tree** — the workbench renders the same provider as a read-only "system" view, so a user writing C can browse exactly the headers and libs they may `#include` / link against.

For a **multi-target** toolchain, the optional `machine` argument selects the right sysroot — cc65 maps the active machine id to its compiler target *and* the matching bundled runtime (e.g. `nes` → `nes`, `atari-xl` → `atari`). Return `undefined` (or omit `sysroot` entirely) when the toolchain bundles nothing, as MADS does.

```ts
// cc65: machine id → cc65 target (-t); the same id selects the bundled sysroot.
const targetFor = (machine?: string) => ({ nes: 'nes', 'atari-xl': 'atari' }[machine ?? ''] ?? 'nes')

export const cc65Toolchain: ToolchainPlugin = {
  // ...
  sysroot(machine) {
    return sysrootFor(targetFor(machine))   // RO ZipAssetProvider for the target
  },
  async build(input) {
    // same targetFor(input.machine) keeps the compiler target and sysroot in lock-step
    return buildCc65(input.main, input.files, targetFor(input.machine))
  },
}
```

## Failure contract

The contract is **failure ⇒ `exitCode !== 0` and `binary` absent**. If your assembler exits 0 on a parse error that produced no binary, force `exitCode = 1` yourself. The contract harness checks exactly this.

## Validate it

A ready-made harness ships for toolchains:

```ts
import { assertToolchainPlugin } from '@ports/test'
import { echoToolchain } from './echo'
import { describe, it } from 'vitest'

describe('echo toolchain', () =>
  it('contract', () => assertToolchainPlugin(echoToolchain, {
    source: { path: 'src/hello.txt', content: new TextEncoder().encode('hi') },
    badSource: { path: 'src/missing.txt', content: new Uint8Array() },
  })))
```

It checks the id slug, the build round-trip (ok + non-empty binary + `exitCode` 0), the failure path, and the shape of optional `sourceMap` / `labels`. See [Validating your plugin](/docs/extending/validating/).
