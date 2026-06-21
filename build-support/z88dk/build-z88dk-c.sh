#!/usr/bin/env bash
# Build the z88dk C path to wasm32-wasip1: the zcc driver + its sub-tools
# (ucpp preprocessor, zpragma, sccz80 C compiler). No fork — zcc's system()
# is shimmed to an imported host `env.run` that runs each sub-tool wasm on a
# shared VFS (see build-support/z88dk/c-path/zcc-shim.c + the dispatcher).
# Patch-at-build, all idempotent. See wiki/agents/z88dk-wasm-build.md "C path".
#
# Env:
#   Z88DK      z88dk source checkout (full clone — needs src/{zcc,ucpp,zpragma,
#              sccz80,common,copt} + ext/{regex,uthash})
#   WASI_SDK   wasi-sdk dir (bin/clang, share/wasi-sysroot)
#   OUT        dir to install zcc/zcpp/zpragma/sccz80 .wasm into
#   SUPPORT    build-support/z88dk dir (this dir); C-path inputs in $SUPPORT/c-path
set -euo pipefail

: "${Z88DK:?}" "${WASI_SDK:?}" "${OUT:?}"
SUPPORT="${SUPPORT:-$(cd "$(dirname "$0")" && pwd)}"
CPATH="$SUPPORT/c-path"
SR="$WASI_SDK/share/wasi-sysroot"
CC="$WASI_SDK/bin/clang"
STRIP="$WASI_SDK/bin/llvm-strip"
SCRATCH="${SCRATCH:-$OUT/scratch-c}"
mkdir -p "$OUT" "$SCRATCH"

WASI="--sysroot=$SR -D_WASI_EMULATED_SIGNAL -D_WASI_EMULATED_PROCESS_CLOCKS -D_WASI_EMULATED_GETPID -D_WASI_EMULATED_MMAN"
EMU="-lwasi-emulated-signal -lwasi-emulated-process-clocks -lwasi-emulated-getpid -lwasi-emulated-mman"

# ---- patches (idempotent) --------------------------------------------------
# config.h: 4 trivial defines the autotools build would generate (shared with
# the z80asm build; written here too so the C path builds standalone).
cat > "$Z88DK/src/config.h" <<'EOF'
#define PREFIX "/z88dk"
#define BINDIR "/z88dk/bin"
#define UNIX 1
#define Z88DK_VERSION "madside-wasm"
EOF

# zcc_vasprintf: /dev/null length-probe -> vsnprintf(NULL,0,...) (WASI has none).
python3 "$CPATH/patch-vasprintf.py" "$Z88DK/src/zcc/zcc.c"

# ---- zcpp (ucpp preprocessor) ----------------------------------------------
# Uses setjmp/longjmp -> needs the SjLj pass + wasm-exceptions runtime.
echo "▸ zcpp (ucpp)…"
U="$Z88DK/src/ucpp"; O="$SCRATCH/obj-ucpp"; mkdir -p "$O"; objs=()
for f in mem nhash cpp lexer assert macro eval; do
  $CC -std=gnu11 -O2 -mllvm -wasm-enable-sjlj -DSTAND_ALONE -DUCPP_CONFIG $WASI -c "$U/$f.c" -o "$O/$f.o"; objs+=("$O/$f.o")
done
$CC -fwasm-exceptions $WASI "${objs[@]}" -lunwind -lsetjmp $EMU -o "$OUT/zcpp.wasm"

# ---- zpragma (#pragma -> zcc_opt.def) --------------------------------------
echo "▸ zpragma…"
Z="$Z88DK/src/zpragma"; O="$SCRATCH/obj-zpragma"; mkdir -p "$O"
F="-Wno-error=implicit-function-declaration -Wno-implicit-function-declaration -Wno-error=int-conversion"
INC="-I$Z88DK/src/common -I$Z88DK/ext -I$Z88DK/ext/uthash/src"
objs=("$O/zpragma.o"); $CC -std=gnu11 -O2 $WASI $F $INC -c "$Z/zpragma.c" -o "$O/zpragma.o"
for r in ext/regex/regcomp ext/regex/regerror ext/regex/regexec ext/regex/regfree src/common/option src/common/dirname; do
  b=$(echo "$r" | tr '/.' '__'); $CC -std=gnu11 -O2 $WASI $F $INC -c "$Z88DK/$r.c" -o "$O/$b.o"; objs+=("$O/$b.o")
done
$CC -std=gnu11 -O2 $WASI -c "$CPATH/wasm-stubs.c" -o "$O/stubs.o"; objs+=("$O/stubs.o")
$CC $WASI "${objs[@]}" $EMU -o "$OUT/zpragma.wasm"

# ---- sccz80 (C compiler) ---------------------------------------------------
echo "▸ sccz80…"
S="$Z88DK/src/sccz80"; O="$SCRATCH/obj-sccz80"; mkdir -p "$O"
INC="-I$S -I$Z88DK/src/common -I$Z88DK/ext/uthash/src"; objs=()
for f in callfunc cdbfile codegen const data declinit error expr goto io lex main misc plunge preproc primary stmt sym while declparse; do
  $CC -std=gnu99 -O2 $WASI $INC -c "$S/$f.c" -o "$O/$f.o"; objs+=("$O/$f.o")
done
$CC -std=gnu99 -O2 $WASI $INC -c "$Z88DK/src/common/option.c" -o "$O/option.o"; objs+=("$O/option.o")
$CC -std=gnu99 -O2 $WASI -c "$CPATH/wasm-stubs.c" -o "$O/stubs.o"; objs+=("$O/stubs.o")
$CC $WASI "${objs[@]}" $EMU -o "$OUT/sccz80.wasm"

# ---- zcc (the driver, with the system() shim) ------------------------------
echo "▸ zcc (driver + shim)…"
ZC="$Z88DK/src/zcc"; O="$SCRATCH/obj-zcc"; mkdir -p "$O"
INC="-Wno-error=implicit-function-declaration -Wno-implicit-function-declaration -Wno-error=int-conversion -Wno-int-conversion -DLOCAL_REGEXP -I$ZC -I$Z88DK/src/copt -I$Z88DK/src/common -I$Z88DK/ext/uthash/src"
objs=("$O/zcc.o"); $CC -std=gnu11 -O2 $WASI $INC -c "$ZC/zcc.c" -o "$O/zcc.o"
for f in src/copt/regex/regcomp src/copt/regex/regerror src/copt/regex/regexec src/copt/regex/regfree src/common/dirname src/common/option; do
  b=$(echo "$f" | tr '/.' '__'); $CC -std=gnu11 -O2 $WASI $INC -c "$Z88DK/$f.c" -o "$O/$b.o"; objs+=("$O/$b.o")
done
$CC -std=gnu11 -O2 $WASI -c "$CPATH/zcc-shim.c" -o "$O/zcc-shim.o"; objs+=("$O/zcc-shim.o")
$CC $WASI "${objs[@]}" $EMU -o "$OUT/zcc.wasm"

# ---- strip + report --------------------------------------------------------
for w in zcpp zpragma sccz80 zcc; do "$STRIP" --strip-all "$OUT/$w.wasm"; done
ls -lh "$OUT"/{zcc,zcpp,zpragma,sccz80}.wasm
