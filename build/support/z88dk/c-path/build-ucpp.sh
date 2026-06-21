#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)/build"
SDK="$ROOT/wasi-sdk"; SR="$SDK/share/wasi-sysroot"; U="$ROOT/z88dk/src/ucpp"
OUT="$ROOT/obj-ucpp"; mkdir -p "$OUT"; CC="$SDK/bin/clang"
WASI="--sysroot=$SR -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_PROCESS_CLOCKS -D_WASI_EMULATED_GETPID -D_WASI_EMULATED_MMAN"
cd "$U"; objs=()
for f in mem nhash cpp lexer assert macro eval; do
  $CC -std=gnu11 -O2 -mllvm -wasm-enable-sjlj -DSTAND_ALONE -DUCPP_CONFIG $WASI -c "$f.c" -o "$OUT/$f.o"; objs+=("$OUT/$f.o")
done
$CC -fwasm-exceptions $WASI "${objs[@]}" -lunwind -lsetjmp -lwasi-emulated-signal -lwasi-emulated-process-clocks -lwasi-emulated-getpid -lwasi-emulated-mman -o "$ROOT/zcpp.wasm"
ls -lh "$ROOT/zcpp.wasm"; file "$ROOT/zcpp.wasm"
