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
| `build` | `{ args?: string[] }` | no | Build configuration forwarded to the toolchain. |
| `build.args` | `string[]` | no | Raw, toolchain-specific assembler flags (e.g. MADS `-d:SYM=1`, extra `-i:` include paths). Appended to the toolchain's own invocation. If present, **must** be an array of strings or the manifest is rejected. |
| `course` | `{ id: string; lesson: string }` | no | Set when the project was instantiated from a course lesson; drives course mode (the lesson panel). Both `id` and `lesson` must be non-empty strings, else the field is dropped. |

A `build` object with no `args` is kept as an empty `{}`.

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
  "build": { "args": ["-d:DEBUG=1", "-i:lib"] },
  "course": { "id": "atari-basics", "lesson": "01-hello" }
}
```
