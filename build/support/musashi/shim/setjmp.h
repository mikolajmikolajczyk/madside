/*
 * wasm setjmp/longjmp shim for the Musashi build (#145, Phase A).
 *
 * wasi-sdk's <setjmp.h> is gated behind the wasm Exception-handling proposal and
 * ships no target-side SjLj runtime (wasi-sdk 33). Musashi uses setjmp/longjmp
 * only for 68000 address/bus-error traps: setjmp marks the recovery point on the
 * *normal* path (returns 0), longjmp is taken only when the emulated CPU faults.
 *
 * So we shim setjmp to always return 0 (the normal path is unaffected) and make
 * longjmp a hard trap — a correctly-behaving program never faults, and a program
 * that does perform an address/bus error surfaces as a wasm trap (a crash, which
 * is what an unrecoverable 68000 fault is at this stage) rather than unwinding.
 * Phase B can revisit this if proper fault emulation is needed.
 *
 * Placed first on the include path (-I .../shim) so `#include <setjmp.h>` in
 * m68kcpu.h resolves here instead of the wasi header's #error.
 */
#ifndef MADSIDE_MUSASHI_SETJMP_SHIM_H
#define MADSIDE_MUSASHI_SETJMP_SHIM_H

typedef int jmp_buf[1];
typedef int sigjmp_buf[1];

#define setjmp(buf) (0)
#define sigsetjmp(buf, savesigs) (0)

static inline void longjmp(jmp_buf buf, int val) { (void)buf; (void)val; __builtin_trap(); }
static inline void siglongjmp(sigjmp_buf buf, int val) { (void)buf; (void)val; __builtin_trap(); }

#endif
