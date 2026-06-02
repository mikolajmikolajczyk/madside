# madside

In-browser MADS (Mad-Assembler) playground for Atari 8-bit.
Edit `.a65` source → assemble in WASM → run in WASM emulator → step through
registers, flags, memory. VSCode-ish layout.

For full architecture, conventions, build pipeline for `mads.wasm`, and
roadmap, see [`CLAUDE.md`](./CLAUDE.md).

## Status

- ✅ Vite + React + TS skeleton
- ✅ CodeMirror 6 editor with MADS stream highlighter
- ✅ `mads.wasm` bundled in `public/wasm/` (1.9 MB)
- ✅ WASI shim via `@bjorn3/browser_wasi_shim`
- ✅ Assemble pipeline (source → xex bytes)
- ⏳ atari800 WASM emulator integration (next spike)
- ⏳ CPU step + register/flag/memory live state
- ⏳ Blog integration (`codeedit` shortcode feeding examples)

## Dev

```sh
npm install
npm run dev
```

## How mads.wasm is built

See `~/src/mikolajczyk.org/_notes/wasm-spike/REPORT.md`. Pinned to FPC source
commit `17c002e6` (3.3.1 unreleased). Requires `~30 lines` of `crt.pas` shim.

## Roadmap

1. Emulator spike — pick atari800/altirra wasm, integrate.
2. Step / breakpoints / live CPU state from emu.
3. Multi-file project + `icl` resolution in virtual FS.
4. Tutorial mode — Atari 8-bit "leetcode" style lessons.
5. Blog integration — load examples via URL `?src=` or shared JSON.
6. Persistence (localStorage / IndexedDB).
7. Hosting on GitHub Pages or Vercel.
