// cc65 stdlib prototypes carry calling-convention decorators; the engine
// strips them so the function still indexes for identifier completion.
// @expect-includes: cputs, cputc
void __fastcall__ cputs(const char *s);
void __fastcall__ cputc(char c);

void main(void) {
  cput|
}
