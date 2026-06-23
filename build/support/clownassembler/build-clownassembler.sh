#!/usr/bin/env bash
# Build clownassembler (the "custom" frontend) to wasm32-wasip1.
#
# clownassembler is an AGPLv3+ Motorola 68000 assembler, asm68k/SN-68k compatible
# (the idiomatic Sega Genesis/Mega Drive homebrew syntax). It's portable ANSI C
# with the flex/bison output (lexical.c, syntactic.c) committed to the repo and no
# shm/fork/system/mmap, so the wasm build is a single clang invocation — no
# flex/bison, no patches. See wiki/agents/clownassembler-wasm-build.md.
#
# Env:
#   CLOWNASM   clownassembler source checkout (with the clowncommon submodule)
#   WASI_SDK   wasi-sdk dir (bin/clang, share/wasi-sysroot)
#   OUT        dir to install clownassembler.wasm into
set -euo pipefail

: "${CLOWNASM:?}" "${WASI_SDK:?}" "${OUT:?}"
SUPPORT="${SUPPORT:-$(cd "$(dirname "$0")" && pwd)}"
SR="$WASI_SDK/share/wasi-sysroot"
CC="$WASI_SDK/bin/clang"
mkdir -p "$OUT"

# Patch out setjmp/longjmp — wasi-sdk has no target-side SjLj runtime (idempotent).
python3 "$SUPPORT/patch-p2bin.py" "$CLOWNASM/p2bin.c"

# The custom-frontend assembler's translation units (from the Makefile's
# `clownassembler` target). clowncommon/clowncommon.h is found relative to the
# repo root, which is the cwd below.
SRCS="frontend_custom.c dictionary.c io.c lexical.c options.c p2bin.c \
semantic.c shared-memory.c strcmpci.c string.c string-stack.c substitute.c \
syntactic.c"

cd "$CLOWNASM"
# -O2 -DNDEBUG mirrors the release Makefile. -w silences the committed flex/bison
# output's pedantic noise (warnings only; nothing is -Werror).
# shellcheck disable=SC2086
"$CC" --target=wasm32-wasip1 --sysroot="$SR" -O2 -DNDEBUG -w \
    $SRCS -o "$OUT/clownassembler.wasm"
