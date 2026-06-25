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

# Instruction-granular 68000 breakpoints (#146). gpgx is frame-scheduled, so a
# frame-boundary PC check almost never lands on a breakpoint. This patch inserts
# a per-instruction breakpoint check into the m68k_run loop, right before the
# instruction is fetched: md_bp_check(REG_PC) (defined in genesis-gpgx-system.c)
# returns 1 on a breakpoint, which `break`s the loop with PC left at the
# breakpoint (NOT executed). We use this targeted check rather than gpgx's
# HOOK_CPU subsystem because HOOK_CPU also inlines hook calls into every memory
# accessor, bloating codegen past a wasi-sdk clang crash. Idempotent — `git
# checkout` in clone-genesis-gpgx restores the pristine core file each clone.
# Restore the pristine core file first: `git checkout <commit>` in clone is a
# no-op when already on that commit, so a prior patch survives and the sed below
# would not re-apply (or would stack). Force it back to HEAD, then patch fresh.
git -C "$GPGX" checkout -- core/m68k/m68kcpu.c core/z80/z80.c 2>/dev/null || true
if ! grep -q 'md_bp_check' "$CORE/m68k/m68kcpu.c"; then
  # On a breakpoint, consume the rest of the timeslice (m68k.cycles = cycles)
  # before breaking — m68k.cycles is the shared 68k/Z80 time base, so breaking
  # without advancing it leaves the 68000 perpetually "behind", and it never
  # resumes. Treating the frozen CPU as idle (like a STOP instruction) keeps the
  # cycle accounting consistent across the trapped frame.
  sed -i \
    '/\/\* Decode next instruction \*\//a\    { extern int md_bp_check(unsigned int); if (md_bp_check(REG_PC)) { m68k.cycles = cycles; break; } }' \
    "$CORE/m68k/m68kcpu.c"
fi
# Same per-instruction breakpoint check for the Z80 sound coprocessor, injected
# into z80_run before the (unique) instruction fetch/execute. Z80.cycles shares
# the same time base, so consume the timeslice before breaking (as above).
if ! grep -q 'md_z80_bp_check' "$CORE/z80/z80.c"; then
  sed -i \
    '/EXEC_INLINE(op,ROP());/i\    { extern int md_z80_bp_check(unsigned int); if (md_z80_bp_check(Z80.pc.w.l)) { Z80.cycles = cycles; break; } }' \
    "$CORE/z80/z80.c"
fi

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
# The m68k_run loop carries the injected md_bp_check() call (see the sed patch
# above) for instruction-granular 68000 breakpoints (#146).
"$CC" --target=wasm32-wasip1 --sysroot="$SR" -mexec-model=reactor \
  -O2 -DNDEBUG -DLSB_FIRST -DUSE_32BPP_RENDERING -w \
  "${INCLUDES[@]}" \
  "${SOURCES[@]}" \
  -o "$OUT/genesis-gpgx.wasm"

echo "built -> $OUT/genesis-gpgx.wasm"
