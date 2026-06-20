; common ZX Spectrum 48K equates (z80asm syntax)
ULA_PORT  equ $fe        ; IN/OUT: border+beeper (write), keyboard+EAR (read)
SCREEN    equ $4000      ; 6144-byte pixel bitmap
ATTRS     equ $5800      ; 768-byte attribute map
CHARS     equ $3c00      ; ROM font base; glyph for char c is at CHARS + c*8
