---
title: File extensions
description: Source, output, and asset extensions and what handles each.
sidebar:
  order: 3
---

## Source extensions

The MADS toolchain accepts these as input:

| Extension | Handled by |
|-----------|-----------|
| `.a65` | MADS toolchain (source) |
| `.asm` | MADS toolchain (source) |
| `.inc` | MADS toolchain (include) |

The machine boot-equates file ships as `src/<machine>.a65` (e.g. `src/atari.a65`,
`src/nes.a65`).

## Output extensions

The build output extension is set by the toolchain and the target machine's
media table.

| Extension | Machine | Notes |
|-----------|---------|-------|
| `.xex` | Atari (`atari-xl`) | MADS `outputExt`; Atari default media format. |
| `.nes` | NES (`nes`) | iNES image; NES default media format. |

The Atari machine can also load these media formats: `.atr` (disk image),
`.car` / `.rom` / `.bin` (cartridge), `.cas` (cassette). The Atari extension
hints map `.exe` / `.com` / `.obx` → `xex` as well.

## Asset extensions

Files with these extensions are treated as binary assets (not source):

```
png  jpg  jpeg  gif  bmp
csv  bin  raw   tmx  wav
```

## Converters

Asset converters transform input bytes into assembler-includable output. Each
declares the input extensions it accepts:

| Converter id | Input extensions | Purpose |
|--------------|------------------|---------|
| `bin-to-incbin` | `.bin`, `.raw` | Emit raw bytes as `.byte` lines (options: `label`, `perLine`). |
| `csv-to-data` | `.csv` | Emit CSV cells as byte/word data (options: `label`, `size`). |

## Editors

Visual editors are matched to files by extension:

| Editor id | File extensions | Purpose |
|-----------|-----------------|---------|
| `bitmap` | `.1bpp`, `.bmp1` | 1bpp bitmap editor. |

`project.json` itself opens in a visual manifest editor rather than the plain
text editor. Projects can register additional editors via the manifest
[`editors`](/docs/reference/manifest/) map.
