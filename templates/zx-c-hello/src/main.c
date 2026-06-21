/*
 * ZX Spectrum — Hello World in C (z88dk / sccz80).
 *
 * Compiled in the browser by the full z88dk C chain: zcc drives ucpp →
 * sccz80 → z80asm, linking spec_crt0 + zx_clib (+ the ndos console driver) from
 * the bundled +zx sysroot. The IDE wraps the linked binary into a 48K .sna the
 * chips ZX core boots.
 *
 * printf works: z88dk's own console driver (set up by the crt0, independent of
 * the BASIC ROM) renders to the screen. zx_border tints the frame so it's
 * obvious the program ran.
 */
#include <stdio.h>
#include <arch/zx/spectrum.h>

int main(void)
{
    zx_border(INK_BLUE);
    printf("HELLO ZX FROM C!\n");
    printf("z88dk sccz80 -> .sna\n");

    for (;;) { }   /* hold the picture on screen */
    return 0;
}
