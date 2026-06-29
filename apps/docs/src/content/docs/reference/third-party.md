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
| [z88dk (sccz80 / z80asm / appmake)](https://github.com/z88dk/z88dk) | snapshot (git) | Artistic-1.0 (z88dk) / Artistic-2.0 (z80asm) | [upstream](https://github.com/z88dk/z88dk) | ZX Spectrum toolchain — sccz80 C compiler + z80asm assembler/linker + appmake tape/snapshot packager |
| [z88dk +zx sysroot (release)](https://github.com/z88dk/z88dk/releases/tag/v2.4) | 2.4 | Artistic-1.0 (z88dk) / Artistic-2.0 (z80asm) | [upstream](https://github.com/z88dk/z88dk/releases/download/v2.4/z88dk-osx-2.4.zip) | ZX Spectrum C sysroot — crt0 + clibs + headers (C path) |
| [z88dk/regex](https://github.com/z88dk/regex) | snapshot (git submodule) | BSD-3-Clause | [upstream](https://github.com/z88dk/regex) | z80asm dependency (ext/regex) |
| [optparse (skeeto)](https://github.com/skeeto/optparse) | snapshot (git submodule) | Unlicense | [upstream](https://github.com/skeeto/optparse) | z80asm dependency (ext/optparse) |
| [uthash (z88dk fork)](https://github.com/z88dk/uthash) | snapshot (git submodule) | BSD-1-Clause | [upstream](https://github.com/z88dk/uthash) | z80asm dependency (ext/uthash) |
| [Altirra (core)](https://github.com/ilmenit/AltirraSDL) | wasm embed core | GPL-2.0-or-later | [fork @ madside-embed](https://github.com/mikolajmikolajczyk/AltirraSDL/tree/madside-embed) | Atari 8-bit emulator core |
| [chips (C64 + ZX Spectrum cores)](https://github.com/floooh/chips) | single-header C99 (systems/c64.h) | Zlib | [upstream](https://github.com/floooh/chips) | Commodore 64 (6502 + VIC-II + SID + 2× CIA) and ZX Spectrum 48K/128K emulator cores |
| [Open ROMs (C64 KERNAL/BASIC + charset)](https://github.com/MEGA65/open-roms) | prebuilt images (upstream /bin) | GPL-3.0-or-later | [upstream](https://github.com/MEGA65/open-roms) | Free replacement for the Cloanto-copyright C64 KERNAL/BASIC/CHARGEN — Commodore ROMs not shipped |
| [ZX Spectrum 48K ROM](https://github.com/floooh/chips-test) | Sinclair 48K (1982) | Amstrad-redistributable (1999 grant: free redistribution for emulation) | [upstream](https://github.com/floooh/chips-test/blob/master/examples/roms/zx-roms.h) | Sinclair ZX Spectrum 48K system ROM — handed to the chips zx core at init |
| [ZX Spectrum 128K ROMs](https://github.com/floooh/chips-test) | Sinclair 128K (1985) | Amstrad-redistributable (1999 grant: free redistribution for emulation) | [upstream](https://github.com/floooh/chips-test/blob/master/examples/roms/zx-roms.h) | Sinclair ZX Spectrum 128K system ROMs (editor + 48K BASIC banks) — handed to the chips zx core at init for the zx128 machine |
| [clownassembler](https://github.com/Clownacy/clownassembler) | snapshot (git) | AGPL-3.0-or-later | [upstream](https://github.com/Clownacy/clownassembler) | Motorola 68000 assembler (asm68k/SN-68k compatible) — Sega Genesis/Mega Drive toolchain |
| [Genesis Plus GX](https://github.com/ekeeke/Genesis-Plus-GX) | snapshot (git) | Non-commercial (Genesis Plus GX — Charles MacDonald / Eke-Eke; some portions MAME) | [upstream](https://github.com/ekeeke/Genesis-Plus-GX) | Full Sega Mega Drive / Genesis system emulator (VDP + YM2612/PSG + Z80 + I/O) — Genesis run/display backend |
| [Musashi (M68k CPU core)](https://github.com/kstenerud/Musashi) | bundled with Genesis Plus GX | MIT | [upstream](https://github.com/kstenerud/Musashi) | Motorola 68000 CPU emulation inside Genesis Plus GX |

## Bundled libraries

npm packages that ship inside the app. Versions and licences are read from the installed packages.

| Library | Version | Licence | Used for |
| --- | --- | --- | --- |
| [clang-format (wasm)](https://github.com/llvm/llvm-project) | 22.1.7 | MIT (MIT wrapper; clang-format itself is Apache-2.0 WITH LLVM-exception) | C/C++ code formatter |
| [jsnes](https://github.com/bfirsh/jsnes) | 2.1.0 | Apache-2.0 | NES emulator core |
| [browser_wasi_shim](https://github.com/bjorn3/browser_wasi_shim) | 0.4.2 | MIT OR Apache-2.0 | WASI runtime hosting the wasm toolchains in the browser |
| [fflate](https://github.com/101arrowz/fflate) | 0.8.3 | MIT | zip / unzip of the cc65 sysroot assets |
| [idb](https://github.com/jakearchibald/idb) | 8.0.3 | ISC | IndexedDB wrapper (project storage + asset cache) |
| [React (react + react-dom)](https://github.com/facebook/react) | 19.2.7 | MIT | UI framework + DOM renderer |
| [CodeMirror 6](https://github.com/codemirror/dev) | 6.43.1 | MIT | Code editor — view / state / commands / language / autocomplete / lint + lang-cpp/javascript/json |
| [Lezer](https://github.com/lezer-parser) | 1.5.2 | MIT | Incremental parser + syntax highlighting (highlight, common, cpp grammar) |
| [Radix UI](https://github.com/radix-ui/primitives) | 1.1.16 | MIT | Accessible UI primitives — dialog, dropdown-menu, context-menu, tooltip |
| [dockview](https://github.com/mathuo/dockview) | 6.6.1 | MIT | Dockable panel layout |
| [react-markdown](https://github.com/remarkjs/react-markdown) | 10.1.0 | MIT | Markdown rendering (course / lesson content) |
| [vscode-languageserver-node](https://github.com/microsoft/vscode-languageserver-node) | 9.0.1 | MIT | LSP transport + server framework (jsonrpc + languageserver + textdocument) — the @madside/lsp-* servers |
