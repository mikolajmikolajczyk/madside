---
title: Converters
description: Turn project assets into bytes the toolchain can include and link.
sidebar:
  order: 3
---

A **converter** transforms a source asset (PNG, CSV, raw binary, …) into bytes the toolchain can `icl` / include / link. Converters are pure functions — bytes in, bytes out — which is why they can run project-local (loaded from the project itself) and in a worker pool.

## The contract

Source: `@ports/plugin-converter.ts`.

```ts
interface ConverterModule {
  meta: ConverterMeta
  convert: ConvertFn
}

interface ConverterMeta {
  id: string                  // 'bin-to-incbin', 'png-to-charset', …  (stable slug)
  label: string               // shown in the Asset panel
  inputExt: string[]          // extensions this converter accepts, no dot: ['bin', 'raw']
  optionsSchema: OptionSpec[] // declarative form — the Asset panel renders it
}

type ConvertFn = (
  input: Uint8Array,
  opts: Record<string, unknown>,
) => Promise<ConvertOutput>

interface ConvertOutput {
  bytes: Uint8Array     // the converted bytes
  mimeHint?: string     // e.g. 'text/x-asm' — UI hint only
  summary?: string      // one-line result shown after a run
}
```

`OptionSpec` is a discriminated union over `number` / `string` / `boolean` / `enum`, each carrying a `default` (and `min`/`max` for numbers, `options` for enums). The Asset panel renders a form from `optionsSchema` and passes the collected values to `convert` as `opts`.

## Hello-world — a built-in

A built-in converter is a module that default-exports a `ConverterModule`:

```ts
import type { ConverterModule } from '@ports'

const binToIncbin: ConverterModule = {
  meta: {
    id: 'bin-to-incbin',
    label: 'Binary → MADS data',
    inputExt: ['bin', 'raw'],
    optionsSchema: [
      { name: 'label', type: 'string', default: 'data' },
      { name: 'perLine', type: 'number', default: 16, min: 1, max: 64 },
    ],
  },
  async convert(input, opts) {
    const label = String(opts.label ?? 'data')
    const perLine = Math.max(1, Math.min(64, Number(opts.perLine ?? 16)))
    const lines = [`${label}`]
    for (let i = 0; i < input.length; i += perLine) {
      const parts = Array.from(input.subarray(i, i + perLine), (b) =>
        '$' + b.toString(16).toUpperCase().padStart(2, '0'),
      )
      lines.push('        dta ' + parts.join(','))
    }
    const text = lines.join('\n') + '\n'
    return {
      bytes: new TextEncoder().encode(text),
      mimeHint: 'text/x-asm',
      summary: `${input.length} bytes → ${lines.length} lines`,
    }
  },
}

export default binToIncbin
```

Built-ins live under `packages/converters/src/builtins/` (`bin-to-incbin`, `csv-to-data`) and are listed in that pack's `BUILTINS` array.

## Project-local converters

Converters are one of the two kinds that can ship **inside a project** (the other is [editors](/docs/extending/editor/)). Drop a module at `converters/<name>.js` in the project tree. The loader expects a named `meta` export plus a **default-exported `convert` function**:

```js
// converters/passthrough.js
export const meta = {
  id: 'passthrough',
  label: 'Passthrough',
  inputExt: ['bin'],
  optionsSchema: [],
}

export default async function convert(input /*, opts */) {
  return { bytes: input }
}
```

The module is loaded via Blob URL + dynamic `import()`, cached by content hash. A project-local converter **shadows** a built-in with the same `meta.id`. There is no sandbox and no shared utility imports — keep each converter self-contained and copy-pasteable.

## Recipes

A converter only describes *how* to transform. *What* to run is declared per-project in `project.json` under `recipes`:

```jsonc
{
  "recipes": [
    {
      "input": "assets/hello.bin",
      "output": "generated/hello.s",
      "converter": "bin-to-incbin",
      "options": { "label": "hello", "perLine": 16 }
    }
  ]
}
```

A `Recipe` is `{ input, output, converter, options? }`. The **AssetPipelineService** runs recipes: `runAll` does the lot, and `runAffected` re-runs only recipes whose input hash changed. The generated `output` file then sits in the project tree for your `main` source to include.

## Asset panel integration

Selecting a project file in the Asset panel lists the converters whose `inputExt` matches that file. Picking one renders a form from `optionsSchema`, lets you set the output path, and writes (or updates) the matching `recipes` entry — no hand-editing of `project.json` required. Your `meta.label` is the picker label; `summary` is shown after a run.

## Validate it

A `assertConverterPlugin(mod)` harness validates the static shape (`meta.id` slug, `inputExt`, `optionsSchema`, a `convert` function). For behaviour, write a plain Vitest test that feeds known bytes through `convert` and checks the output. See [Validating your plugin](/docs/extending/validating/) for the harnesses and the general pattern.
