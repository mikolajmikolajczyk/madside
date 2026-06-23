; Sega Mega Drive / Genesis — Hello World (clownassembler, asm68k syntax).
; Initialises the VDP and shows a solid blue background. From here you can load
; tile patterns into VRAM, a palette into CRAM, and write nametable entries to
; draw graphics or text — see the VDP register table at the bottom.

	include	"src/genesis.inc"

; ---- 68000 vector table ($000000-$0000FF) --------------------------------
	dc.l	$00FFFE00		; $00 initial supervisor stack pointer
	dc.l	Start			; $04 reset -> entry point
	dcb.l	62,Generic		; $08-$FF exception / interrupt vectors

; ---- ROM header ($000100-$0001FF) ----------------------------------------
	dc.b	"SEGA MEGA DRIVE "	; $100 console name
	dcb.b	$1F0-*,' '		; $110-$1EF header fields (unused here)
	dc.b	"JUE             "	; $1F0 region (Japan / US / Europe)

; ---- entry point ($000200) -----------------------------------------------
Start:
	lea	VDP_CTRL,a1		; a1 = VDP control port
	lea	VDPRegs(pc),a0		; a0 = register init table
	move.w	#VDPRegsEnd-VDPRegs-1,d1	; loop count - 1
	move.w	#$8000,d0		; register-write command base ($8rvv)
.regloop:
	move.b	(a0)+,d0		; low byte = this register's value
	move.w	d0,(a1)			; write it
	addi.w	#$0100,d0		; advance to the next register number
	dbra	d1,.regloop

	; backdrop colour (CRAM entry 0) -> blue
	move.l	#$C0000000,(a1)		; VDP CRAM write, address 0
	move.w	#$0E00,VDP_DATA		; colour word: 0000 BBB0 GGG0 RRR0 = blue

	move.w	#$8144,(a1)		; VDP register 1 = $44: turn the display on

Forever:
	bra	Forever			; nothing else to do — spin

Generic:
	rte				; generic exception / interrupt handler

; ---- VDP register init table (registers $00-$12) -------------------------
VDPRegs:
	dc.b	$04			; $00 H-interrupt off
	dc.b	$04			; $01 display off (enabled later), genesis mode
	dc.b	$30			; $02 plane A nametable -> $C000
	dc.b	$3C			; $03 window nametable
	dc.b	$07			; $04 plane B nametable -> $E000
	dc.b	$6C			; $05 sprite table -> $D800
	dc.b	$00			; $06
	dc.b	$00			; $07 backdrop -> palette 0, colour 0
	dc.b	$00,$00			; $08-$09
	dc.b	$FF			; $0A H-interrupt counter
	dc.b	$00			; $0B
	dc.b	$81			; $0C 40-cell (H40) mode
	dc.b	$37			; $0D H-scroll table -> $FC00
	dc.b	$00			; $0E
	dc.b	$02			; $0F auto-increment = 2
	dc.b	$01			; $10 scroll size 64x32
	dc.b	$00,$00			; $11-$12 window position
VDPRegsEnd:
	even
