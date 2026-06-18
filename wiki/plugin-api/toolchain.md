# ToolchainPlugin

> Source: [`src/ports/plugin-toolchain.ts`](../../src/ports/plugin-toolchain.ts). MADS reference impl: [`src/plugins/toolchain-mads/`](../../src/plugins/toolchain-mads/).

Wraps an assembler / compiler so `BuildService` stays machine-agnostic. Dispatched by `manifest.toolchain` id.

## Contract

```ts
interface ToolchainPlugin {
  id: string                  // 'mads', 'ca65', 'kickass'
  name: string
  inputExt: readonly string[] // ['a65', 'asm', 'inc']
  language?: ToolchainLanguage // optional editor-language metadata (see below)
  outputExt: string           // 'xex', 'nes', 'prg'
  build(input: ToolchainBuildInput): Promise<ToolchainBuildOutput>
  sysroot?(machine?: string): VfsProvider | undefined // RO bundled runtime (see below)
}

interface ToolchainBuildInput {
  projectId: string
  main: string                // entry-point file
  files: { path: string; content: Uint8Array }[]
  options?: Record<string, unknown> // manifest build.args forwarded here
  machine?: string            // active machine id (manifest.machine); multi-target → compiler target + sysroot
}

interface ToolchainBuildOutput {
  ok: boolean
  binary?: Uint8Array         // absent on failure
  stdout: string
  stderr: string
  sourceMap?: SourceMap       // pre-parsed
  labels?: Map<string, number>
  extras?: Record<string, unknown>
  exitCode: number            // 0 on success; non-zero on failure (contract)
}
```

The plugin owns parsing — the workbench never reads raw `.lst` / `.lab` text. UI consumes `sourceMap` + `labels` directly.

Manifest `build.args` are forwarded to the build via `ToolchainBuildInput.options` — the plugin reads its own option schema out of that free-form bag.

## Editor language (optional)

A toolchain may declare `language?: ToolchainLanguage` (epic `78b12bf`). It is declarative and library-agnostic (no CodeMirror dependency): the editor pairs it with the machine CPU's opcode set (`@core/cpu`) to drive syntax highlighting, directive recognition, and autocomplete. It carries the *assembler-specific* vocabulary — opcodes come from the CPU, not here. Omit it and the toolchain falls back to plain text.

```ts
interface ToolchainLanguage {
  directives: readonly string[]                  // uppercase, no prefix — highlighted as directives + skipped by the label scanner
  lineComment: string | readonly string[]        // e.g. ';' or [';', '//']
  snippets?: readonly ToolchainSnippet[]          // autocomplete snippets (optional)
  cSymbols?: readonly ToolchainCSymbol[]          // C lib symbols for .c/.h autocomplete + hover (cc65; #48)
}

interface ToolchainSnippet {
  label: string
  detail: string
  template: string                                // CodeMirror ${n:placeholder} syntax
}

interface ToolchainCSymbol {
  label: string     // identifier as typed, e.g. 'cputs'
  detail?: string   // one-line signature, e.g. 'void cputs(const char*)'
  info?: string     // longer hover text
  header?: string   // declaring header, e.g. 'conio.h' — auto-#include'd on accept
}
```

`cSymbols` drives the C editor (cc65's curated `conio` + stdlib surface, `cc65-symbols.ts`) — declarative, no CodeMirror dependency, not full clangd analysis. Accepting a completion auto-`#include`s its `header`.

## Sysroot (optional)

`sysroot?(machine?): VfsProvider | undefined` — a read-only bundled runtime the toolchain mounts at build time. MADS has none; cc65 ships `include/` + `asminc/`, `lib/<target>.lib`, and the linker cfg. Returns a `VfsProvider` from the VFS layer (ADR-0008, `@core/vfs`) — a lazily-yielded `read` / `list` / `stat` tree. The **same** provider drives both the build and the file tree's read-only "system" view (#50), so a C author browses exactly what they may `#include` / link.

`machine` selects the target's sysroot for a multi-target toolchain — cc65 maps the active machine id to its `-t` target *and* the matching bundled runtime (`nes`→`nes`, `atari-xl`→`atari`); keep build and sysroot on the same `targetFor(machine)`. Return `undefined` / omit when nothing is bundled.

Toolchains assemble the build filesystem by composing project sources + the sysroot through the VFS; one bridge materialises that into the WASI preopen — replaces the per-toolchain `placeFile` / `mkdirP` plumbing (ADR-0008).

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

Register + select via manifest:

```ts
plugins.register({ plugin: { ...echoToolchain, kind: 'toolchain' }, source: { origin: 'builtin' } })
```

```jsonc
{ "version": 2, "toolchain": "echo", "main": "src/hello.txt", ... }
```

## Contract test

Use the shared harness:

```ts
import { describe, it } from 'vitest'
import { assertToolchainPlugin } from '@ports/test'
import { echoToolchain } from './echo'

describe('echo toolchain', () => {
  it('contract', () => assertToolchainPlugin(echoToolchain, {
    source: { path: 'src/hello.txt', content: new TextEncoder().encode('hi') },
    badSource: { path: 'src/missing.txt', content: new Uint8Array() },
  }))
})
```

Validates id slug shape, build round-trip (ok + non-empty binary + exitCode 0), failure path (ok:false + exitCode ≠ 0), and shape of optional `sourceMap` / `labels`.

## Notes

- BuildService passes `manifest.toolchain` id through the `ToolchainResolverFn` injected at workbench construction; the default resolver delegates to `PluginRegistry.get('toolchain', id)`.
- Plugin authors who emit a per-line listing should pre-parse into a `SourceMap` (`addrToLoc` + `locToAddr`) so the editor's PC marker + breakpoint gutter work for free.
- If your assembler exits 0 on parse errors that produce no binary, force `exitCode = 1` yourself — the contract is "failure ⇒ exitCode ≠ 0".
