---
title: File extensions
description: Source, output, and asset extensions and what handles each.
sidebar:
  order: 3
---

## Source extensions

madside ships two toolchains: `mads` (Atari assembly) and `cc65` (C + ca65 +
ld65). Each declares the extensions it accepts as input.

### Assembly (MADS)

The `mads` toolchain accepts these as input:

| Extension | Handled by |
|-----------|-----------|
| `.a65` | `mads` toolchain (source) |
| `.asm` | `mads` toolchain (source) |
| `.inc` | `mads` toolchain (include) |

The machine boot-equates file ships as `src/<machine>.a65` (e.g. `src/atari.a65`,
`src/nes.a65`).

### C and ca65 (cc65)

The `cc65` toolchain (C compiler + ca65 assembler + ld65 linker) accepts these
as input:

| Extension | Handled by |
|-----------|-----------|
| `.c` | `cc65` toolchain (C source) |
| `.h` | `cc65` toolchain (C header) |
| `.s` | `cc65` toolchain (ca65 assembly source) |
| `.asm` | `cc65` toolchain (assembly source) |
| `.inc` | `cc65` toolchain (include) |

The editor additionally treats `.cc` / `.cpp` / `.hpp` (and `.cxx` / `.hh` for
formatting) as C/C++ sources for syntax highlighting and clang-format.

## Output extensions

The build output extension is set by the toolchain and the target machine's
media table.

| Extension | Machine | Notes |
|-----------|---------|-------|
| `.xex` | Atari (`atari-xl`) | Atari default media format. `mads` `outputExt`; also produced by `cc65` targeting `atari`. |
| `.nes` | NES (`nes`) | iNES image; NES default media format. `cc65` `outputExt`; also produced by `mads` (NROM iNES). |

The `cc65` toolchain's declared `outputExt` is `nes`, but the real extension is
picked from the active machine's target: `nes` for the NES, `xex` for the Atari.

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
