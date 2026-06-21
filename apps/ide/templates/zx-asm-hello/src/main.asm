; ZX Spectrum 48K — Hello World in Z80 assembly (z88dk z80asm).
;
; Disables interrupts, clears the screen, paints attributes, then draws a
; string by copying glyphs straight from the ROM font (CHARS at $3C00, 8 bytes
; per character). Drawing into screen memory directly — rather than RST $10 /
; the ROM print routine — keeps the demo independent of the BASIC system
; variables, which a freshly-loaded .sna snapshot hasn't set up.
;
; Build: z88dk (z80asm) → 48K .sna → boots in the chips ZX core.

	include "zx.inc"        ; ULA_PORT, SCREEN, ATTRS, CHARS equates

	org $8000
start:
	di                      ; take over the machine

	ld a,1
	out (ULA_PORT),a        ; blue border

	; clear the 6144-byte pixel bitmap ($4000-$57FF)
	ld hl,SCREEN
	ld de,SCREEN+1
	ld bc,6144-1
	ld (hl),0
	ldir

	; paint all 768 attribute cells: bright white paper, black ink
	ld hl,ATTRS
	ld de,ATTRS+1
	ld bc,768-1
	ld (hl),$78             ; BRIGHT(40)+PAPER white(38)+INK black(00)
	ldir

	; draw the message at the top-left, one glyph (8 px rows) per column
	ld ix,text
	ld b,0                  ; column 0..n
draw_char:
	ld a,(ix+0)
	or a
	jr z,done
	; glyph source = CHARS + char*8
	ld l,a
	ld h,0
	add hl,hl
	add hl,hl
	add hl,hl               ; hl = char*8
	ld de,CHARS
	add hl,de               ; hl -> 8-byte glyph in ROM
	; dest = SCREEN + column (top third: each pixel row is +256)
	ld d,$40
	ld e,b                  ; de = $4000 + column
	ld c,8
row:
	ld a,(hl)
	ld (de),a
	inc hl
	inc d                   ; next pixel row
	dec c
	jr nz,row
	inc b
	inc ix
	jr draw_char
done:
	jr done

text:
	defb "HELLO ZX FROM Z80ASM!",0
