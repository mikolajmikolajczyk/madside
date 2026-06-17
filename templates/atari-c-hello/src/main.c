/* Atari 8-bit "hello world" in C, built with cc65.
 *
 * cc65 ships a `conio` text console for the Atari, so a first program can be
 * this small. The toolchain compiles this with cc65 (-t atari), assembles it
 * with ca65, and links it against the bundled Atari runtime into a .xex that
 * boots on the Altirra core — the same machine the MADS Atari templates use.
 *
 * Try it: change the text, or add a loop, then Build + Run.
 */
#include <conio.h>

void main(void) {
    clrscr();
    cputs("HELLO ATARI FROM C!");
    /* Return to DOS would normally end here; spin so the screen stays up. */
    while (1) {
    }
}
