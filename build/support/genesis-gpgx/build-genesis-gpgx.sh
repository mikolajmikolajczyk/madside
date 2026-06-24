#!/usr/bin/env bash
# Build Genesis Plus GX (full Sega Mega Drive) + the madside frontend harness to
# a wasm32 reactor (#145, Phase B). Single wasi-sdk clang pass — gpgx commits its
# m68k opcode tables (no m68kmake host step). The harness genesis-gpgx-system.c
# replaces libretro.c; osd.h here replaces libretro/osd.h (no libretro-common).
#
# Env:
#   GPGX       Genesis-Plus-GX source checkout
#   WASI_SDK   wasi-sdk dir (bin/clang, share/wasi-sysroot)
#   OUT        dir to install genesis-gpgx.wasm into
#   SUPPORT    this dir (osd.h + genesis-gpgx-system.c + shim/)
set -euo pipefail

: "${GPGX:?}" "${WASI_SDK:?}" "${OUT:?}"
SUPPORT="${SUPPORT:-$(cd "$(dirname "$0")" && pwd)}"
SHIM="$SUPPORT/shim"
SR="$WASI_SDK/share/wasi-sysroot"
CC="$WASI_SDK/bin/clang"
CORE="$GPGX/core"
mkdir -p "$OUT"

# Core source set: every core/*.c subtree EXCEPT cd_hw/libchdr (CHD/zstd/lzma —
# SegaCD only) and sound/tremor (OGG Vorbis — CD audio only). minimp3 is header-
# only. cd_hw/*.c itself compiles (USE_LIBCHDR / USE_LIBVORBIS left undefined).
SOURCES=(
  "$CORE"/*.c
  "$CORE"/z80/*.c
  "$CORE"/m68k/*.c
  "$CORE"/ntsc/*.c
  "$CORE"/sound/*.c
  "$CORE"/input_hw/*.c
  "$CORE"/cart_hw/*.c
  "$CORE"/cart_hw/svp/*.c
  "$CORE"/cd_hw/*.c
  "$GPGX"/libretro/scrc32.c
  "$SUPPORT"/genesis-gpgx-system.c
)

# Include order: setjmp shim FIRST (wasi-sdk <setjmp.h> #errors — m68k only uses
# it for the dormant address-error trap), then our osd.h (must win over
# libretro/osd.h), then the core subtrees, then libretro/ for scrc32.h.
INCLUDES=(
  -I "$SHIM"
  -I "$SUPPORT"
  -I "$CORE"
  -I "$CORE"/z80
  -I "$CORE"/m68k
  -I "$CORE"/ntsc
  -I "$CORE"/sound
  -I "$CORE"/sound/minimp3
  -I "$CORE"/input_hw
  -I "$CORE"/cart_hw
  -I "$CORE"/cart_hw/svp
  -I "$CORE"/cd_hw
  -I "$GPGX"/libretro
)

# LSB_FIRST: wasm is little-endian. USE_32BPP_RENDERING: 0xAARRGGBB framebuffer.
"$CC" --target=wasm32-wasip1 --sysroot="$SR" -mexec-model=reactor \
  -O2 -DNDEBUG -DLSB_FIRST -DUSE_32BPP_RENDERING -w \
  "${INCLUDES[@]}" \
  "${SOURCES[@]}" \
  -o "$OUT/genesis-gpgx.wasm"

echo "built -> $OUT/genesis-gpgx.wasm"
