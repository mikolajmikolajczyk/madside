/* NES "hello world" in C, built with cc65.
 *
 * cc65 ships a `conio` text console for the NES, so a first program can be this
 * small — no manual PPU setup. The toolchain compiles this with cc65, assembles
 * it with ca65, and links it against the bundled NES runtime (nes.lib) into an
 * iNES ROM that boots on the jsnes core.
 *
 * Try it: change the text, or the loop, then Build + Run.
 */
#include <conio.h>

void main(void) {
    clrscr();
    cputs("HELLO NES FROM C!");
    /* The NES has no OS to return to — spin forever. */
    while (1) {
    }
}
