import type { ToolchainCSymbol } from '@ports'

// Curated cc65 C library symbols for autocomplete + hover (#48). Not exhaustive
// — the common surface a beginner reaches for: the NES/Atari-friendly `conio`
// text console plus a slice of the standard library. Full clangd-style analysis
// is out of scope.
export const CC65_C_SYMBOLS: readonly ToolchainCSymbol[] = [
  // conio.h — text console
  { label: 'clrscr', detail: 'void clrscr(void)', info: 'Clear the screen.' },
  { label: 'cputc', detail: 'void cputc(char c)', info: 'Output one character at the cursor.' },
  { label: 'cputcxy', detail: 'void cputcxy(unsigned char x, unsigned char y, char c)', info: 'Move to (x,y), then output a character.' },
  { label: 'cputs', detail: 'void cputs(const char* s)', info: 'Output a string at the cursor.' },
  { label: 'cputsxy', detail: 'void cputsxy(unsigned char x, unsigned char y, const char* s)', info: 'Move to (x,y), then output a string.' },
  { label: 'cprintf', detail: 'int cprintf(const char* fmt, ...)', info: 'Formatted output to the console.' },
  { label: 'cgetc', detail: 'char cgetc(void)', info: 'Wait for and return a key press.' },
  { label: 'kbhit', detail: 'unsigned char kbhit(void)', info: 'Non-zero if a key is waiting.' },
  { label: 'gotoxy', detail: 'void gotoxy(unsigned char x, unsigned char y)', info: 'Move the cursor to (x,y).' },
  { label: 'gotox', detail: 'void gotox(unsigned char x)', info: 'Set the cursor column.' },
  { label: 'gotoy', detail: 'void gotoy(unsigned char y)', info: 'Set the cursor row.' },
  { label: 'wherex', detail: 'unsigned char wherex(void)', info: 'Current cursor column.' },
  { label: 'wherey', detail: 'unsigned char wherey(void)', info: 'Current cursor row.' },
  { label: 'cclearxy', detail: 'void cclearxy(unsigned char x, unsigned char y, unsigned char len)', info: 'Clear len characters from (x,y).' },
  { label: 'chlinexy', detail: 'void chlinexy(unsigned char x, unsigned char y, unsigned char len)', info: 'Draw a horizontal line from (x,y).' },
  { label: 'cvlinexy', detail: 'void cvlinexy(unsigned char x, unsigned char y, unsigned char len)', info: 'Draw a vertical line from (x,y).' },
  { label: 'revers', detail: 'unsigned char revers(unsigned char onoff)', info: 'Enable/disable reverse video; returns the old state.' },
  { label: 'textcolor', detail: 'unsigned char textcolor(unsigned char color)', info: 'Set the text colour; returns the old one.' },
  { label: 'bgcolor', detail: 'unsigned char bgcolor(unsigned char color)', info: 'Set the background colour; returns the old one.' },
  { label: 'bordercolor', detail: 'unsigned char bordercolor(unsigned char color)', info: 'Set the border colour; returns the old one.' },
  { label: 'cursor', detail: 'unsigned char cursor(unsigned char onoff)', info: 'Show/hide the cursor; returns the old state.' },
  { label: 'screensize', detail: 'void screensize(unsigned char* x, unsigned char* y)', info: 'Get the screen dimensions.' },
  // string.h / stdlib.h — common
  { label: 'memcpy', detail: 'void* memcpy(void* dst, const void* src, size_t n)' },
  { label: 'memset', detail: 'void* memset(void* dst, int c, size_t n)' },
  { label: 'strlen', detail: 'size_t strlen(const char* s)' },
  { label: 'strcpy', detail: 'char* strcpy(char* dst, const char* src)' },
  { label: 'strcat', detail: 'char* strcat(char* dst, const char* src)' },
  { label: 'strcmp', detail: 'int strcmp(const char* a, const char* b)' },
  { label: 'malloc', detail: 'void* malloc(size_t size)' },
  { label: 'free', detail: 'void free(void* ptr)' },
  { label: 'abs', detail: 'int abs(int n)' },
  { label: 'rand', detail: 'int rand(void)' },
  { label: 'srand', detail: 'void srand(unsigned seed)' },
  // common fixed-width types
  { label: 'uint8_t', detail: 'unsigned 8-bit integer' },
  { label: 'int8_t', detail: 'signed 8-bit integer' },
  { label: 'uint16_t', detail: 'unsigned 16-bit integer' },
  { label: 'int16_t', detail: 'signed 16-bit integer' },
]
