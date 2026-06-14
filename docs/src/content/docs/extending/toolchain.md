---
title: Toolchain plugins
description: The assemble contract — build input/output, source map, labels, editor language.
sidebar:
  order: 7
---

A **toolchain plugin** wraps an assembler or compiler so `BuildService` stays machine-agnostic. The build is dispatched by the project's `manifest.toolchain` id. MADS is the reference impl (`src/plugins/toolchain-mads/`); ca65 and KickAssembler follow the same shape.

Toolchain plugins are **built-in only**, and they run in a **dedicated worker per build** — keep `build` pure and serialisable (no DOM).

## The contract

Source: `@ports/plugin-toolchain.ts`.

```ts
interface ToolchainPlugin {
  readonly id: string                  // 'mads', 'ca65', 'kickass'
  readonly name: string
  readonly inputExt: readonly string[] // source extensions, no dot: ['a65', 'asm', 'inc']
  readonly outputExt: string           // binary extension, no dot: 'xex' | 'nes' | 'prg'
  readonly language?: ToolchainLanguage // optional editor-language metadata
  build(input: ToolchainBuildInput): Promise<ToolchainBuildOutput>
}
```

## The assemble contract

```ts
interface ToolchainBuildInput {
  projectId: string
  main: string                 // entry-point file path
  files: { path: string; content: Uint8Array }[]  // every file the build might need
  options?: Record<string, unknown>               // forwarded from the manifest
}

interface ToolchainBuildOutput {
  ok: boolean
  binary?: Uint8Array          // absent on failure
  stdout: string
  stderr: string
  sourceMap?: SourceMap        // pre-parsed (see below)
  labels?: Map<string, number> // pre-parsed name → address
  extras?: Record<string, unknown>  // pass-through (raw listing text, etc.)
  exitCode: number             // 0 on success; non-zero on failure (contract)
}
```

`files` carries every file the toolchain might need — sources, includes, generated asset overlays. Your plugin filters by its own `inputExt`. Build the entry point named by `main` and return the binary.

**The plugin owns parsing.** The workbench never reads raw `.lst` / `.lab` / `.sym` text — you pre-parse into `sourceMap` + `labels` and the UI consumes those directly.

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

## `build.args` / options forwarding

`manifest`-level build options are forwarded into `build` as `input.options` (free-form `Record<string, unknown>`). Document your toolchain's accepted option keys in your plugin's own docs — the workbench passes them through unchanged and never interprets them. (`BuildService` calls your `build` with `projectId`, `main`, `files`, and these `options`.)

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
