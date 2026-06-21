/* Commodore 64 "hello world" in C, built with cc65.
 *
 * cc65 ships a `conio` text console for the C64, so a first program can be this
 * small. The toolchain compiles this with cc65 (-t c64), assembles it with
 * ca65, and links it against the bundled C64 runtime into a .prg that boots on
 * the chips C64 core — running the GPL Open ROMs (the Commodore KERNAL/BASIC
 * are not shipped).
 *
 * Try it: change the text or the border colour, then Build + Run.
 */
#include <conio.h>
#include <c64.h>

void main(void) {
    VIC.bordercolor = COLOR_BLACK;
    VIC.bgcolor0 = COLOR_BLUE;
    clrscr();
    cputs("HELLO C64 FROM C!");
    /* Spin so the screen stays up. */
    while (1) {
    }
}
