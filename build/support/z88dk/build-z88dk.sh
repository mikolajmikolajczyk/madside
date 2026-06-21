#!/usr/bin/env bash
# Build z88dk z80asm + appmake to wasm32-wasip1. Patch-at-build (no fork).
# Env:
#   Z88DK      z88dk source checkout (with ext/{regex,optparse,uthash} submodules)
#   WASI_SDK   wasi-sdk dir (bin/clang, share/wasi-sysroot)
#   OUT        dir to install z80asm.wasm + appmake.wasm into
#   SUPPORT    dir holding split-action-switch.py + wasm-stubs.c (this dir)
# Scratch object dirs live under $OUT/../obj-* by default.
set -euo pipefail

: "${Z88DK:?}" "${WASI_SDK:?}" "${OUT:?}"
SUPPORT="${SUPPORT:-$(cd "$(dirname "$0")" && pwd)}"
SR="$WASI_SDK/share/wasi-sysroot"
CC="$WASI_SDK/bin/clang"
CXX="$WASI_SDK/bin/clang++"
SCRATCH="${SCRATCH:-$OUT/scratch}"
mkdir -p "$OUT" "$SCRATCH"

WASI="--sysroot=$SR -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_PROCESS_CLOCKS -D_WASI_EMULATED_GETPID -D_WASI_EMULATED_MMAN"
EMU="-lwasi-emulated-signal -lwasi-emulated-process-clocks -lwasi-emulated-getpid -lwasi-emulated-mman"

# ---- patches (idempotent) --------------------------------------------------
ASM="$Z88DK/src/z80asm"
AM="$Z88DK/src/appmake"

# config.h: 4 trivial defines the autotools build would generate.
cat > "$Z88DK/src/config.h" <<'EOF'
#define PREFIX "/z88dk"
#define BINDIR "/z88dk/bin"
#define UNIX 1
#define Z88DK_VERSION "madside-wasm"
EOF

# parse1.c memory split (28G -> 8G). Idempotent (skips if already applied).
python3 "$SUPPORT/split-action-switch.py" "$ASM/src/c/parse_rules.h"

# appmake ti8xk/gmp: extend z88dk's own MSVC stub guard to honour NO_GMP.
perl -0pi -e 's/#ifndef _MSC_VER\n(extern int\s+ti8xk_exec)/#if !defined(_MSC_VER) && !defined(NO_GMP)\n$1/' "$AM/appmake.h"

# ---- z80asm (C++17) --------------------------------------------------------
OBJ_ASM="$SCRATCH/obj-z80asm"; mkdir -p "$OBJ_ASM"
cd "$ASM"
INC="-I. -Isrc -I../common -Isrc/c -It -I../../ext/optparse -I../../ext/regex -I../../ext/uthash/src"
objs=()
echo ">>> z80asm: C++ sources"
for f in src/*.cpp src/cpp/*.cpp; do
  o="$OBJ_ASM/$(echo "$f" | tr '/.' '__').o"
  [ -f "$o" ] && { objs+=("$o"); continue; }
  $CXX -std=gnu++17 -fwasm-exceptions -O2 $WASI $INC -Isrc/cpp -c "$f" -o "$o"
  objs+=("$o")
done
echo ">>> z80asm: C sources (parse1.c at -O0; it is the big one)"
for f in src/c/*.c ../common/*.c ../../ext/regex/reg*.c; do
  [ "$f" = "src/c/test.c" ] && continue
  o="$OBJ_ASM/$(echo "$f" | tr '/.' '__').o"
  [ -f "$o" ] && { objs+=("$o"); continue; }
  opt="-O2"; [ "$f" = "src/c/parse1.c" ] && opt="-O0"
  $CC -std=gnu11 $opt $WASI $INC -c "$f" -o "$o"
  objs+=("$o")
done
so="$OBJ_ASM/wasm-stubs.o"; $CC -std=gnu11 -O2 $WASI -c "$SUPPORT/wasm-stubs.c" -o "$so"
echo ">>> z80asm: link"
$CXX -fwasm-exceptions $WASI "${objs[@]}" "$so" -lunwind $EMU -o "$OUT/z80asm.wasm"
"$WASI_SDK/bin/llvm-strip" --strip-all "$OUT/z80asm.wasm"   # ~11M -> ~7M (drop names/debug)

# ---- appmake (C) -----------------------------------------------------------
OBJ_AM="$SCRATCH/obj-appmake"; mkdir -p "$OBJ_AM"
cd "$AM"
AINC="-I. -I../common -DNO_GMP -Wno-error=implicit-function-declaration -Wno-implicit-function-declaration"
aobjs=()
echo ">>> appmake: C sources (minus ti8xk.c)"
for f in *.c ../common/dirname.c; do
  [ "$f" = "ti8xk.c" ] && continue
  o="$OBJ_AM/$(echo "$f" | tr '/.' '__').o"
  [ -f "$o" ] && { aobjs+=("$o"); continue; }
  $CC -std=gnu11 -O2 $WASI $AINC -c "$f" -o "$o"
  aobjs+=("$o")
done
aso="$OBJ_AM/wasm-stubs.o"; $CC -std=gnu11 -O2 $WASI -c "$SUPPORT/wasm-stubs.c" -o "$aso"
echo ">>> appmake: link"
$CC $WASI "${aobjs[@]}" "$aso" $EMU -o "$OUT/appmake.wasm"
"$WASI_SDK/bin/llvm-strip" --strip-all "$OUT/appmake.wasm"

ls -lh "$OUT/z80asm.wasm" "$OUT/appmake.wasm"
