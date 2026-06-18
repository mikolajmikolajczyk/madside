---
title: project.json
description: Complete reference for the v2 project manifest.
sidebar:
  order: 1
---

Every project carries a `project.json` at its root. madside ships **manifest v2**
only — v1 manifests are rejected with `project.json v1 unsupported, recreate
project`. The validator is hand-rolled (no schema library); the rules below are
exactly what `parseProjectManifest` enforces.

## Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | `2` | yes | Must be the literal `2`. `1` and any other value are rejected. |
| `name` | `string` | yes | Project display name. Must be a non-empty string. |
| `main` | `string` | yes | POSIX path of the entry source the toolchain assembles. Non-empty. |
| `machine` | `string` | yes | MachinePlugin id (e.g. `atari-xl`, `nes`). Non-empty. |
| `toolchain` | `string` | yes | ToolchainPlugin id (e.g. `mads`). Non-empty. |
| `emulator` | `string` | no | EmulatorPlugin id. When absent, resolved from the active machine's `compatibleEmulators`. |
| `debugAdapter` | `string` | no | DebugAdapter id. Same resolution rule as `emulator`. |
| `panels` | `string[]` | no | Panel plugin ids to surface by default. Falls back to the machine's `defaultPanels`. Only applied when every element is a string. |
| `run` | `{ default?: { audio?: boolean } }` | no | Run defaults. Stored verbatim when an object. |
| `recipes` | `Recipe[]` | no | Asset-pipeline entries (see below). Stored when an array. |
| `editors` | `Record<string, string>` | no | Map of file extension (no dot, lowercase) → editor module path. Only applied when all values are strings. |
| `build` | `{ trigger?: 'auto' \| 'manual'; options?: object }` | no | Build configuration. `trigger` is generic; `options` is a toolchain-specific bag (below). |
| `build.trigger` | `'auto' \| 'manual'` | no | When the build runs. Defaults to `manual`: the build runs only on Ctrl+S / Run, not on every keystroke, which keeps large projects snappy. `auto` rebuilds on every (debounced) edit. Any other value rejects the manifest. |
| `build.options` | `object` | no | Toolchain-specific build options, forwarded verbatim to the active toolchain plugin — the manifest stays toolchain-agnostic, so each plugin owns its own keys (validated at build time). Must be an object. See below. |
| `editor` | `{ tabWidth?: number; format?: string }` | no | Code-editor preferences. |
| `editor.tabWidth` | `number` | no | Spaces per indent level and the render width of a literal tab in the code editor. Must be an **integer 1–16**; any other value (non-number, fractional, out of range) rejects the manifest. Defaults to `4`. |
| `editor.format` | `string` | no | clang-format style used to format C/C++ sources: either a preset name (`LLVM`, `Google`, `Chromium`, `Mozilla`, `WebKit`, `Microsoft`, `GNU`) or inline `.clang-format` YAML. A `.clang-format` file in the project overrides this; when absent the style defaults to `LLVM`. `IndentWidth` follows `editor.tabWidth`. Must be a non-empty string, else the manifest is rejected. |
| `course` | `{ id: string; lesson: string }` | no | Set when the project was instantiated from a course lesson; drives course mode (the lesson panel). Both `id` and `lesson` must be non-empty strings, else the field is dropped. |

### `build.options` — per toolchain

The manifest doesn't know any toolchain's flags; `build.options` is passed through to the active toolchain plugin, which validates its own keys at build time.

**MADS** (`mads`):

- `args` — `string[]`, raw assembler flags (e.g. `-d:SYM=1`, extra `-i:` include paths).

**cc65** (`cc65`):

- `config` — `string`, a project-relative path to a custom ld65 linker config (`*.cfg`) used instead of the bundled `<target>.cfg` (custom memory layout / mappers).
- `cc65Args` / `ca65Args` / `ld65Args` — `string[]`, extra flags forwarded to the cc65 compiler / ca65 assembler / ld65 linker respectively (e.g. `cc65Args: ["-Osir"]`).

A legacy top-level `build.args` is still accepted and folds into `options.args`. A `build` object with no options is kept as an empty `{}`.

```json
"build": {
  "trigger": "manual",
  "options": { "config": "src/custom.cfg", "ld65Args": ["-D", "__FOO__=1"] }
}
```

### Recipe shape

Each entry in `recipes` runs one converter during the asset pipeline:

```ts
interface Recipe {
  input: string
  output: string
  converter: string
  options?: Record<string, unknown>
}
```

## Example

```json
{
  "version": 2,
  "name": "Hello Atari",
  "main": "src/main.a65",
  "machine": "atari-xl",
  "toolchain": "mads",
  "emulator": "altirra-wasm",
  "debugAdapter": "atari-6502-debug",
  "panels": ["memory", "registers", "output"],
  "run": { "default": { "audio": true } },
  "recipes": [
    {
      "input": "assets/sprite.bin",
      "output": "generated/sprite.inc",
      "converter": "bin-to-incbin",
      "options": { "label": "sprite", "perLine": 16 }
    }
  ],
  "editors": { "1bpp": "editors/bitmap" },
  "build": { "trigger": "manual", "options": { "args": ["-d:DEBUG=1", "-i:lib"] } },
  "editor": { "tabWidth": 4, "format": "LLVM" },
  "course": { "id": "atari-basics", "lesson": "01-hello" }
}
```
