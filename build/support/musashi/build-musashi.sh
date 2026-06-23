#!/usr/bin/env bash
# Build the Musashi 68000 core + our Genesis system harness to a wasm32 reactor
# (#145, Phase A). Two stages: a host pass to generate the opcode tables (Musashi
# ships m68kmake, not the generated m68kops.c), then a wasi-sdk clang reactor pass.
#
# Env:
#   MUSASHI    Musashi source checkout (m68kcpu.c, m68kmake.c, m68k_in.c, headers)
#   WASI_SDK   wasi-sdk dir (bin/clang, share/wasi-sysroot)
#   OUT        dir to install musashi.wasm into
#   SUPPORT    dir holding musashi-system.c (this dir)
set -euo pipefail

: "${MUSASHI:?}" "${WASI_SDK:?}" "${OUT:?}"
SUPPORT="${SUPPORT:-$(cd "$(dirname "$0")" && pwd)}"
SR="$WASI_SDK/share/wasi-sysroot"
CC="$WASI_SDK/bin/clang"
GEN="${SCRATCH:-$OUT/gen}"
mkdir -p "$OUT" "$GEN"

# 1. Host: generate m68kops.{c,h} from m68k_in.c (1967 opcode handlers).
cc -O2 -o "$GEN/m68kmake" "$MUSASHI/m68kmake.c"
"$GEN/m68kmake" "$GEN" "$MUSASHI/m68k_in.c"

# 2. wasi reactor: CPU core + generated ops + the system harness. The harness's
# EXPORT()ed functions are the only entry points (no _start). -O2 keeps the 776K
# m68kops table fast; the static ROM/RAM buffers live in bss.
# -I shim FIRST: a wasm setjmp/longjmp shim — wasi-sdk's <setjmp.h> #errors
# without an SjLj runtime, and Musashi only needs setjmp for CPU fault traps.
"$CC" --target=wasm32-wasip1 --sysroot="$SR" -mexec-model=reactor -O2 -DNDEBUG -w \
    -I "$SUPPORT/shim" -I "$MUSASHI" -I "$GEN" -I "$SUPPORT" \
    "$MUSASHI/m68kcpu.c" "$GEN/m68kops.c" "$MUSASHI/softfloat/softfloat.c" "$SUPPORT/musashi-system.c" \
    -o "$OUT/musashi.wasm"
