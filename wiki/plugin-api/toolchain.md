# ToolchainPlugin

> Source: [`src/ports/plugin-toolchain.ts`](../../src/ports/plugin-toolchain.ts). MADS reference impl: [`src/plugins/toolchain-mads/`](../../src/plugins/toolchain-mads/).

Wraps an assembler / compiler so `BuildService` stays machine-agnostic. Dispatched by `manifest.toolchain` id.

## Contract

```ts
interface ToolchainPlugin {
  id: string                  // 'mads', 'ca65', 'kickass'
  name: string
  inputExt: readonly string[] // ['a65', 'asm', 'inc']
  outputExt: string           // 'xex', 'nes', 'prg'
  build(input: ToolchainBuildInput): Promise<ToolchainBuildOutput>
}

interface ToolchainBuildInput {
  projectId: string
  main: string                // entry-point file
  files: { path: string; content: Uint8Array }[]
  options?: Record<string, unknown>
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
