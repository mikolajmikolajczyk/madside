import type { ToolchainCSymbol } from '@ports'

// Curated cc65 C library symbols for autocomplete + hover (#48). Not exhaustive
// — the common surface a beginner reaches for: the NES/Atari-friendly `conio`
// text console plus a slice of the standard library. Each carries the header
// that declares it, so the editor can show it and auto-`#include` it on accept.
// Full clangd-style analysis is out of scope.
export const CC65_C_SYMBOLS: readonly ToolchainCSymbol[] = [
  // conio.h — text console
  { label: 'clrscr', header: 'conio.h', detail: 'void clrscr(void)', info: 'Clear the screen.' },
  { label: 'cputc', header: 'conio.h', detail: 'void cputc(char c)', info: 'Output one character at the cursor.' },
  { label: 'cputcxy', header: 'conio.h', detail: 'void cputcxy(unsigned char x, unsigned char y, char c)', info: 'Move to (x,y), then output a character.' },
  { label: 'cputs', header: 'conio.h', detail: 'void cputs(const char* s)', info: 'Output a string at the cursor.' },
  { label: 'cputsxy', header: 'conio.h', detail: 'void cputsxy(unsigned char x, unsigned char y, const char* s)', info: 'Move to (x,y), then output a string.' },
  { label: 'cprintf', header: 'conio.h', detail: 'int cprintf(const char* fmt, ...)', info: 'Formatted output to the console.' },
  { label: 'cgetc', header: 'conio.h', detail: 'char cgetc(void)', info: 'Wait for and return a key press.' },
  { label: 'kbhit', header: 'conio.h', detail: 'unsigned char kbhit(void)', info: 'Non-zero if a key is waiting.' },
  { label: 'gotoxy', header: 'conio.h', detail: 'void gotoxy(unsigned char x, unsigned char y)', info: 'Move the cursor to (x,y).' },
  { label: 'gotox', header: 'conio.h', detail: 'void gotox(unsigned char x)', info: 'Set the cursor column.' },
  { label: 'gotoy', header: 'conio.h', detail: 'void gotoy(unsigned char y)', info: 'Set the cursor row.' },
  { label: 'wherex', header: 'conio.h', detail: 'unsigned char wherex(void)', info: 'Current cursor column.' },
  { label: 'wherey', header: 'conio.h', detail: 'unsigned char wherey(void)', info: 'Current cursor row.' },
  { label: 'cclearxy', header: 'conio.h', detail: 'void cclearxy(unsigned char x, unsigned char y, unsigned char len)', info: 'Clear len characters from (x,y).' },
  { label: 'chlinexy', header: 'conio.h', detail: 'void chlinexy(unsigned char x, unsigned char y, unsigned char len)', info: 'Draw a horizontal line from (x,y).' },
  { label: 'cvlinexy', header: 'conio.h', detail: 'void cvlinexy(unsigned char x, unsigned char y, unsigned char len)', info: 'Draw a vertical line from (x,y).' },
  { label: 'revers', header: 'conio.h', detail: 'unsigned char revers(unsigned char onoff)', info: 'Enable/disable reverse video; returns the old state.' },
  { label: 'textcolor', header: 'conio.h', detail: 'unsigned char textcolor(unsigned char color)', info: 'Set the text colour; returns the old one.' },
  { label: 'bgcolor', header: 'conio.h', detail: 'unsigned char bgcolor(unsigned char color)', info: 'Set the background colour; returns the old one.' },
  { label: 'bordercolor', header: 'conio.h', detail: 'unsigned char bordercolor(unsigned char color)', info: 'Set the border colour; returns the old one.' },
  { label: 'cursor', header: 'conio.h', detail: 'unsigned char cursor(unsigned char onoff)', info: 'Show/hide the cursor; returns the old state.' },
  { label: 'screensize', header: 'conio.h', detail: 'void screensize(unsigned char* x, unsigned char* y)', info: 'Get the screen dimensions.' },
  // string.h
  { label: 'memcpy', header: 'string.h', detail: 'void* memcpy(void* dst, const void* src, size_t n)' },
  { label: 'memset', header: 'string.h', detail: 'void* memset(void* dst, int c, size_t n)' },
  { label: 'strlen', header: 'string.h', detail: 'size_t strlen(const char* s)' },
  { label: 'strcpy', header: 'string.h', detail: 'char* strcpy(char* dst, const char* src)' },
  { label: 'strcat', header: 'string.h', detail: 'char* strcat(char* dst, const char* src)' },
  { label: 'strcmp', header: 'string.h', detail: 'int strcmp(const char* a, const char* b)' },
  // stdlib.h
  { label: 'malloc', header: 'stdlib.h', detail: 'void* malloc(size_t size)' },
  { label: 'free', header: 'stdlib.h', detail: 'void free(void* ptr)' },
  { label: 'abs', header: 'stdlib.h', detail: 'int abs(int n)' },
  { label: 'rand', header: 'stdlib.h', detail: 'int rand(void)' },
  { label: 'srand', header: 'stdlib.h', detail: 'void srand(unsigned seed)' },
  // stdint.h — fixed-width types
  { label: 'uint8_t', header: 'stdint.h', detail: 'unsigned 8-bit integer' },
  { label: 'int8_t', header: 'stdint.h', detail: 'signed 8-bit integer' },
  { label: 'uint16_t', header: 'stdint.h', detail: 'unsigned 16-bit integer' },
  { label: 'int16_t', header: 'stdint.h', detail: 'signed 16-bit integer' },
]
