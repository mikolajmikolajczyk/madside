#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)/build"
SDK="$ROOT/wasi-sdk"; SR="$SDK/share/wasi-sysroot"; Z="$ROOT/z88dk/src/zcc"
OUT="$ROOT/obj-zcc"; mkdir -p "$OUT"; CC="$SDK/bin/clang"
WASI="--sysroot=$SR -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_PROCESS_CLOCKS -D_WASI_EMULATED_GETPID -D_WASI_EMULATED_MMAN"
INC="-Wno-error=implicit-function-declaration -Wno-implicit-function-declaration -Wno-error=int-conversion -Wno-int-conversion -DLOCAL_REGEXP -I. -I../copt -I../common -I../../ext/uthash/src"
cd "$Z"; objs=()
$CC -std=gnu11 -O2 $WASI $INC -c zcc.c -o "$OUT/zcc.o"; objs+=("$OUT/zcc.o")
for f in ../copt/regex/regcomp ../copt/regex/regerror ../copt/regex/regexec ../copt/regex/regfree ../common/dirname ../common/option; do
  b=$(echo "$f" | tr '/.' '__'); $CC -std=gnu11 -O2 $WASI $INC -c "$f.c" -o "$OUT/$b.o"; objs+=("$OUT/$b.o")
done
$CC -std=gnu11 -O2 $WASI -c "$ROOT/zcc-shim.c" -o "$OUT/zcc-shim.o"; objs+=("$OUT/zcc-shim.o")
$CC $WASI "${objs[@]}" -lwasi-emulated-signal -lwasi-emulated-process-clocks -lwasi-emulated-getpid -lwasi-emulated-mman -o "$ROOT/zcc.wasm"
ls -lh "$ROOT/zcc.wasm"; file "$ROOT/zcc.wasm"
