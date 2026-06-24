; Common Sega Mega Drive / Genesis equates (asm68k syntax).
VDP_DATA	equ	$C00000		; VDP data port (word)
VDP_CTRL	equ	$C00004		; VDP control port (word/long)
VDP_HV		equ	$C00008		; H/V counter (read)
RAM		equ	$FF0000		; 64K work RAM (mirrored from $E00000)
IO_DATA1	equ	$A10003		; controller 1 data
IO_CTRL1	equ	$A10009		; controller 1 control
Z80_RAM		equ	$A00000		; Z80 sound RAM (8 KB)
Z80_BUSREQ	equ	$A11100		; Z80 bus request
Z80_RESET	equ	$A11200		; Z80 reset
