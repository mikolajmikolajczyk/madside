/*
 * ZX Spectrum — Hello World in C (z88dk / sccz80).
 *
 * Compiled in the browser by the full z88dk C chain: zcc drives ucpp →
 * sccz80 → z80asm, linking spec_crt0 + zx_clib from the bundled +zx sysroot.
 * The IDE wraps the linked binary into a 48K .sna the chips ZX core boots.
 *
 * No stdio here (printf needs the ZX console driver — a follow-up): this paints
 * the screen straight through zx_clib's ULA helpers, then freezes so the
 * snapshot captures the result.
 */
#include <arch/zx/spectrum.h>

int main(void)
{
    zx_border(INK_BLUE);                  /* blue border               */
    zx_cls_attr(PAPER_WHITE | INK_BLUE);  /* clear to white paper, blue ink */

    for (;;) { }                          /* hold the picture on screen */
    return 0;
}
