#!/usr/bin/env bash
# Repackage the minimal +zx C sysroot into packages/toolchain-z88dk/src/zx-sysroot.zip.
#
# The sysroot is the prebuilt crt0 + clibs + headers + target config that
# `zcc +zx -create-app` (classic clib) needs. It comes from the z88dk v2.4
# *binary release* (the .lib files are precompiled RMF, platform-independent),
# NOT the git snapshot used for the wasm tools.
#
# The closure below was derived empirically: build a no-stdio program and a
# program that calls a zx_clib function (zx_border) against a candidate tree,
# add whatever the assembler/linker reports missing, repeat until exit 0.
# Result: lib/config + lib/target/zx + lib/crt + four clibs + z80rules + include.
#
# Usage:  build-zx-sysroot.sh [/path/to/extracted/z88dk]
#   default source: /tmp/zxsys/z88dk  (gh release download v2.4 z88dk-osx-2.4.zip, unzip)
set -euo pipefail

SRC="${1:-/tmp/zxsys/z88dk}"
REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
OUT="$REPO/packages/toolchain-z88dk/src/zx-sysroot.zip"
STAGE="$(mktemp -d)/z88dk"

[ -d "$SRC/lib/config" ] || { echo "no z88dk tree at $SRC (extract z88dk-osx-2.4.zip first)"; exit 1; }

mkdir -p "$STAGE/lib/clibs" "$STAGE/lib/target"
cp -r "$SRC/lib/config"     "$STAGE/lib/config"
cp -r "$SRC/lib/target/zx"  "$STAGE/lib/target/zx"   # crt0 + def/
cp -r "$SRC/lib/crt"        "$STAGE/lib/crt"         # crt_*.inc pulled by spec_crt0.asm
cp -r "$SRC/include"        "$STAGE/include"
# classic-clib link set: zx runtime + math + base z80 + crt0 lib + ndos (the
# no-DOS fcntl/console driver — provides writebyte, needed by printf/stdio; the
# release zx_clib references but doesn't bundle it).
for l in zx_clib mzx z80_clib z80_crt0 ndos; do cp "$SRC/lib/clibs/$l.lib" "$STAGE/lib/clibs/"; done
# loose lib/ files: crt0 header INCLUDEd by spec_crt0.asm, z80asm runtime, rom crt0
cp "$SRC/lib/z80_crt0.hdr" "$SRC/lib/z88dk-z80asm.lib" "$SRC/lib/zxr_crt0.asm" "$STAGE/lib/"
cp "$SRC"/lib/z80rules.* "$STAGE/lib/" 2>/dev/null || true   # for real copt (currently passthrough)

# zip with fflate (relative entries: lib/..., include/...; mounted at /z88dk by the dispatcher)
ROOT="$STAGE" OUTZIP="$OUT" node --input-type=module -e '
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { zipSync } from "fflate"
const ROOT=process.env.ROOT, OUT=process.env.OUTZIP, map={}
const walk=d=>{ for(const e of readdirSync(d)){ const p=join(d,e)
  statSync(p).isDirectory() ? walk(p) : (map[relative(ROOT,p)]=[new Uint8Array(readFileSync(p)),{level:9}]) } }
walk(ROOT)
writeFileSync(OUT, zipSync(map,{level:9}))
console.log("entries", Object.keys(map).length, "->", OUT)
' 2>/dev/null || (cd "$REPO" && ROOT="$STAGE" OUTZIP="$OUT" node --input-type=module -e '
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, relative } from "node:path"
import { zipSync } from "fflate"
const ROOT=process.env.ROOT, OUT=process.env.OUTZIP, map={}
const walk=d=>{ for(const e of readdirSync(d)){ const p=join(d,e)
  statSync(p).isDirectory() ? walk(p) : (map[relative(ROOT,p)]=[new Uint8Array(readFileSync(p)),{level:9}]) } }
walk(ROOT); writeFileSync(OUT, zipSync(map,{level:9}))
console.log("entries", Object.keys(map).length, "->", OUT)')

ls -lh "$OUT"
rm -rf "$(dirname "$STAGE")"
