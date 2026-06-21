---
title: Third-party software
description: The upstream tools and libraries madside bundles, with versions and licences.
---

<!-- AUTO-GENERATED from third-party.toml by scripts/third-party.py. Do not edit by hand — run `just third-party-docs`. -->

madside bundles the following third-party software. Build-time toolchains (Free Pascal, wasi-sdk, Emscripten) compile the artifacts below but are not themselves shipped.

## Built from source

Compiled to WebAssembly by `just build-*` and committed as bundle assets. **Source** is the exact repository we build from — our fork where we carry patches, the upstream project otherwise.

| Software | Version | Licence | Source | Used for |
| --- | --- | --- | --- | --- |
| [Mad-Assembler (MADS)](https://github.com/tebe6502/Mad-Assembler) | 2.1.6 | Freeware (custom — see upstream) | [upstream](https://github.com/tebe6502/Mad-Assembler) | Atari 8-bit 6502 macro assembler |
| [cc65 (cc65 / ca65 / ld65)](https://github.com/cc65/cc65) | snapshot (git) | Zlib | [upstream](https://github.com/cc65/cc65) | C compiler + 6502 assembler & linker |
| [z88dk (z80asm / appmake)](https://github.com/z88dk/z88dk) | snapshot (git) | Artistic-1.0 (z88dk) / Artistic-2.0 (z80asm) | [upstream](https://github.com/z88dk/z88dk) | Z80 assembler+linker & tape packager — ZX Spectrum toolchain (asm-first) |
| [z88dk +zx sysroot (release)](https://github.com/z88dk/z88dk/releases/tag/v2.4) | 2.4 | Artistic-1.0 (z88dk) / Artistic-2.0 (z80asm) | [upstream](https://github.com/z88dk/z88dk/releases/download/v2.4/z88dk-osx-2.4.zip) | ZX Spectrum C sysroot — crt0 + clibs + headers (C path) |
| [z88dk/regex](https://github.com/z88dk/regex) | snapshot (git submodule) | BSD-3-Clause | [upstream](https://github.com/z88dk/regex) | z80asm dependency (ext/regex) |
| [optparse (skeeto)](https://github.com/skeeto/optparse) | snapshot (git submodule) | Unlicense | [upstream](https://github.com/skeeto/optparse) | z80asm dependency (ext/optparse) |
| [uthash (z88dk fork)](https://github.com/z88dk/uthash) | snapshot (git submodule) | BSD-1-Clause | [upstream](https://github.com/z88dk/uthash) | z80asm dependency (ext/uthash) |
| [Altirra (core)](https://github.com/ilmenit/AltirraSDL) | wasm embed core | GPL-2.0-or-later | [fork @ madside-embed](https://github.com/mikolajmikolajczyk/AltirraSDL/tree/madside-embed) | Atari 8-bit emulator core |
| [chips (C64 system core)](https://github.com/floooh/chips) | single-header C99 (systems/c64.h) | Zlib | [upstream](https://github.com/floooh/chips) | Commodore 64 emulator core — 6502 CPU + VIC-II + SID + 2× CIA |
| [Open ROMs (C64 KERNAL/BASIC + charset)](https://github.com/MEGA65/open-roms) | prebuilt images (upstream /bin) | GPL-3.0-or-later | [upstream](https://github.com/MEGA65/open-roms) | Free replacement for the Cloanto-copyright C64 KERNAL/BASIC/CHARGEN — Commodore ROMs not shipped |
| [ZX Spectrum 48K ROM](https://github.com/floooh/chips-test) | Sinclair 48K (1982) | Amstrad-redistributable (1999 grant: free redistribution for emulation) | [upstream](https://github.com/floooh/chips-test/blob/master/examples/roms/zx-roms.h) | Sinclair ZX Spectrum 48K system ROM — handed to the chips zx core at init |

## Bundled libraries

npm packages that ship inside the app. Versions and licences are read from the installed packages.

| Library | Version | Licence | Used for |
| --- | --- | --- | --- |
| [clang-format (wasm)](https://github.com/llvm/llvm-project) | 22.1.7 | MIT (MIT wrapper; clang-format itself is Apache-2.0 WITH LLVM-exception) | C/C++ code formatter |
| [jsnes](https://github.com/bfirsh/jsnes) | 2.1.0 | Apache-2.0 | NES emulator core |
| [browser_wasi_shim](https://github.com/bjorn3/browser_wasi_shim) | 0.4.2 | MIT OR Apache-2.0 | WASI runtime hosting the wasm toolchains in the browser |
| [fflate](https://github.com/101arrowz/fflate) | 0.8.3 | MIT | zip / unzip of the cc65 sysroot assets |
| [idb](https://github.com/jakearchibald/idb) | 8.0.3 | ISC | IndexedDB wrapper (project storage + asset cache) |
