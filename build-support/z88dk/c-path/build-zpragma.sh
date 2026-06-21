#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)/build"
SDK="$ROOT/wasi-sdk"; SR="$SDK/share/wasi-sysroot"; Z="$ROOT/z88dk/src/zpragma"
OUT="$ROOT/obj-zpragma"; mkdir -p "$OUT"; CC="$SDK/bin/clang"
WASI="--sysroot=$SR -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_PROCESS_CLOCKS -D_WASI_EMULATED_GETPID -D_WASI_EMULATED_MMAN"
F="-Wno-error=implicit-function-declaration -Wno-implicit-function-declaration -Wno-error=int-conversion"
INC="-I../common -I../../ext -I../../ext/uthash/src"
cd "$Z"; objs=()
$CC -std=gnu11 -O2 $WASI $F $INC -c zpragma.c -o "$OUT/zpragma.o"; objs+=("$OUT/zpragma.o")
for r in ../../ext/regex/regcomp ../../ext/regex/regerror ../../ext/regex/regexec ../../ext/regex/regfree ../common/option ../common/dirname; do
  b=$(echo $r|tr '/.' '__'); $CC -std=gnu11 -O2 $WASI $F $INC -c "$r.c" -o "$OUT/$b.o"; objs+=("$OUT/$b.o")
done
$CC -std=gnu11 -O2 $WASI -c "$ROOT/wasm-stubs.c" -o "$OUT/stubs.o"; objs+=("$OUT/stubs.o")
$CC $WASI "${objs[@]}" -lwasi-emulated-signal -lwasi-emulated-process-clocks -lwasi-emulated-getpid -lwasi-emulated-mman -o "$ROOT/zpragma.wasm"
ls -lh "$ROOT/zpragma.wasm"
