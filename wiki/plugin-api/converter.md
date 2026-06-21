# Converter (AssetPlugin)

> Source: [`packages/ports/src/plugin-converter.ts`](../../packages/ports/src/plugin-converter.ts). Built-in pack: [`packages/converters/src`](../../packages/converters/src).

Converts a source asset into bytes the toolchain can `icl` / link. Recipes in `project.json` declare `{ input, output, converter, options }`; AssetPipelineService runs them.

## Contract (abridged)

```ts
interface ConverterModule {
  meta: ConverterMeta
  convert: ConvertFn
}

interface ConverterMeta {
  id: string                      // 'png-to-1bpp', 'json-to-dlist', ...
  label: string
  inputExt: string[]              // ['png', 'gif']
  optionsSchema: OptionSpec[]     // declarative form: AssetPanel renders it
}

type ConvertFn = (input: Uint8Array, opts: Record<string, unknown>) => Promise<ConvertOutput>

interface ConvertOutput {
  bytes: Uint8Array
  mimeHint?: string               // optional content-type hint
  summary?: string                // optional human-readable conversion summary
}
```

There is **no `outputExt` field on the converter** — the output extension is set by the recipe's `output` path in `project.json`, not declared on the converter itself.

## Hello-world

```ts
import type { ConverterMeta, ConvertFn } from '@ports'

export const meta: ConverterMeta = {
  id: 'passthrough',
  label: 'Passthrough',
  inputExt: ['bin'],
  optionsSchema: [],
}

const convert: ConvertFn = async (input) => {
  return { bytes: input }
}

export default convert
```

Drop as `converters/passthrough.js` in a project; AssetPanel picks it up. Project-local converters are loaded by Blob URL expecting a named `meta` export plus a default-exported `convert` (shape above). Built-in converters instead export the whole `ConverterModule` (`{ meta, convert }`) and register in `@plugins/converters/builtins/`.

## Recipe entry

```jsonc
{
  "recipes": [
    {
      "input": "assets/hello.bin",
      "output": "generated/hello.bin",
      "converter": "passthrough",
      "options": {}
    }
  ]
}
```

AssetPipelineService.runAffected (`49d594d`) reruns only recipes whose input hash changed.

## Notes

- Converters are self-contained ES modules. No shared utility imports. Copy-pasteable between projects.
- Loaded via Blob URL + dynamic `import()`. No sandbox.
- Project-local converters in `converters/*.js` shadow built-ins by `meta.id`.
- The canonical converter library lives in a separate repo + blog (see deferred items).
