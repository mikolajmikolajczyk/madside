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
`node:wasi` (file-backed stdin/stdout), copt = passthrough (unoptimised). The
production version must port this to `browser_wasi_shim` with a shared in-memory
Directory across instances. ZCCCFG=`/z88dk/lib/config`; sysroot = z88dk v2.4
`lib/`+`include/`.

## Remaining
printf needs the ZX console-driver lib (`writebyte`); package +zx sysroot zip;
install the wasm in the recipe; wire toolchain-z88dk (inputExt c/h); zx-c-hello
template; pin z88dk v2.4 in third-party.toml.
