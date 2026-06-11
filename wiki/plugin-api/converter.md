# Converter (AssetPlugin)

> Source: [`src/ports/plugin-converter.ts`](../../src/ports/plugin-converter.ts). Built-in pack: [`src/plugins/converters/`](../../src/plugins/converters/).

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
  inputExts: readonly string[]    // ['png', 'gif']
  outputExt: string               // '1bpp'
  options: readonly OptionSpec[]  // declarative form: AssetPanel renders it
}

type ConvertFn = (input: Uint8Array, opts: Record<string, unknown>) => Promise<ConvertOutput>

interface ConvertOutput {
  bytes: Uint8Array
}
```

## Hello-world

```ts
import type { ConverterModule } from '@ports'

const passthrough: ConverterModule = {
  meta: {
    id: 'passthrough',
    label: 'Passthrough',
    inputExts: ['bin'],
    outputExt: 'bin',
    options: [],
  },
  async convert(input) {
    return { bytes: input }
  },
}

export default passthrough
```

Drop as `converters/passthrough.js` in a project; AssetPanel picks it up. Or register as a built-in in `@plugins/converters/builtins/`.

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
