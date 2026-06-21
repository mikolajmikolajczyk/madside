# z88dk C path (#87) — build inputs (work in progress)

Reference build scripts + patches for the z88dk **C** toolchain (sccz80) to WASI,
driven by `zcc.wasm` with a `system()`→host shim. Proven: a C program compiles,
links (crt0 + zx_clib), and BOOTS in the chips zx core. See
`wiki/agents/z88dk-wasm-build.md` "C path (#87)" for the full story.

## Tools (build each from the z88dk source, wasi-sdk clang)
- `build-sccz80.sh` — sccz80.wasm (C compiler). Plain gnu99.
- `build-ucpp.sh`   — zcpp.wasm (C preprocessor). Needs `-mllvm -wasm-enable-sjlj`
                      + link `-fwasm-exceptions -lunwind -lsetjmp` (uses setjmp).
- `build-zpragma.sh`— zpragma.wasm (#pragma → zcc_opt.def; creates zcc_opt.def).
- `build-zcc.sh`    — zcc.wasm (the driver). Links `zcc-shim.c`.

## Patches (no fork)
- `zcc-shim.c` — overrides `system()`→imported `env.run` (host runs the sub-tool
  wasm on the shared VFS) + `mkstemp`/`mkdtemp`/`tmpfile` (wasi-libc lacks them).
- **zcc.c `zcc_vasprintf`**: replace its `/dev/null` length-probe with
  `vsnprintf(NULL,0,…)` — WASI has no /dev/null, else every built command is empty:
  ```
  perl -0pi -e 's/\(fp = fopen\("\/dev\/null".*?req = -1;\n    \}/req = vsnprintf(NULL,0,fmt,ap); ret = calloc(req+1,1); req = vsnprintf(ret,req+1,fmt,saveap); *s = ret;/s' zcc.c
  ```
  (see build-zcc.sh / the spike for the exact applied form)

## Host dispatcher (`dispatcher.reference.mjs`, node spike)
Services zcc's `env.run`: tokenises the command (strips quotes WITHIN tokens,
**normalises `..`/`.`/`//`** in path args — WASI won't traverse `..`, drops literal
`(null)`), handles `cat` + `< > >>` redirection, runs the 4 real tools via
`node:wasi` (file-backed stdin/stdout), copt = passthrough (unoptimised).
ZCCCFG=`/z88dk/lib/config`; sysroot = z88dk v2.4 `lib/`+`include/`.

This reference is the spec for the **production** port, now live in
`src/plugins/toolchain-z88dk/wasm/z88dk-wasm.ts` (`buildZ88dkC`): same parse /
normPathPart / cat / copt-passthrough logic, ported to `browser_wasi_shim` over a
**single `/`-named `PreopenDirectory` shared across every sub-tool instance**
(absolute + cwd-relative opens both resolve). The sysroot mounts read-only at
`/z88dk` via `ZipAssetProvider`; sub-tool modules are preloaded so `env.run` runs
them synchronously inside zcc's `system()`. Output: the linked binary is JS-wrapped
into a 48K `.sna` (org 0x8000), same as the asm path.

## Sysroot (`build-zx-sysroot.sh`)
Repackages the minimal +zx C sysroot (crt0 + clibs + headers + target config)
into `src/plugins/toolchain-z88dk/zx-sysroot.zip` (relative entries `lib/…`
`include/…`, mounted at `/z88dk` by the dispatcher). Source = z88dk **v2.4 binary
release** (precompiled RMF `.lib`, platform-independent), pinned in `third-party.toml`
(`[source.z88dk-sysroot-zx]`) — NOT the git snapshot used for the wasm tools.

Closure (derived empirically — build until the assembler/linker stops reporting
missing files): `lib/config` + `lib/target/zx` + `lib/crt` + `lib/clibs/{zx_clib,
mzx,z80_clib,z80_crt0}.lib` + loose `lib/{z80_crt0.hdr,z88dk-z80asm.lib,
zxr_crt0.asm,z80rules.*}` + `include/`. ~2.1M zipped, 1044 entries. Validated:
a no-stdio `main` and a `zx_border()` call both compile→link→appmake (`.tap`).

## Status (#87)
DONE: sysroot zip + `build-zx-sysroot.sh`; `build-z88dk-c.sh` + `just build-z88dk-c`
(sccz80/zcpp/zcc/zpragma wasm installed); dispatcher ported to `browser_wasi_shim`
(`buildZ88dkC`); toolchain-z88dk wired (inputExt `c`/`h`, `.c` main → C path);
`zx-c-hello` template. A C program compiles → links → boots end-to-end, **incl.
`printf`** (headless chips-zx smoke confirms glyphs reach screen RAM).

**stdio fix:** the release `zx_clib` *references* `writebyte` (the fd-level
console write) but doesn't bundle it — the definition lives in `ndos.lib` (the
no-DOS fcntl/console driver) + the base `z80_clib`. `zx.cfg`'s `default` clib only
links `-lzx_clib`, so `buildZ88dkC` appends `-lz80_clib -lndos` to the zcc argv
and the sysroot ships `ndos.lib`. The linker pulls only referenced modules, so
no-stdio builds are unaffected. z88dk's own console driver (set up by `spec_crt0`)
renders to the screen — no BASIC ROM vars needed, so it works from a bare `.sna`.

REMAINING: `z88dk-copt` runs as passthrough (peephole optimiser disabled);
enabling it needs the `lib/z80rules.*` (already in the sysroot) wired through a
real copt run.
