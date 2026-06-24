; Sega Mega Drive / Genesis — Z80 sound (clownassembler, asm68k syntax).
; The 68000 sets up the VDP (blue screen), then boots the Z80 sound coprocessor:
; it takes the Z80 bus, copies the sound driver into the Z80's RAM, and releases
; the Z80 so it runs and plays a tone on the PSG. The driver is your own Z80
; source (src/sound/driver.s80), assembled automatically and embedded below.

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

	; ---- boot the Z80 sound CPU and start the driver --------------------
	move.w	#$0100,Z80_BUSREQ	; take the Z80's bus so we can write its RAM
	move.w	#$0100,Z80_RESET	; release the Z80 reset line (needed to load)
.WaitZ80:
	btst	#0,Z80_BUSREQ		; has the 68000 been granted the bus yet?
	bne.s	.WaitZ80		; not yet — keep waiting
	lea	Z80Driver(pc),a0	; source: the driver, sitting in ROM
	lea	Z80_RAM,a1		; destination: Z80 RAM at $A00000
	move.w	#Z80DriverEnd-Z80Driver-1,d2
.CopyZ80:
	move.b	(a0)+,(a1)+		; copy the driver into Z80 RAM, byte by byte
	dbra	d2,.CopyZ80
	move.w	#$0000,Z80_RESET	; pulse the reset line: hold...
	move.w	#$0100,Z80_RESET	; ...and release — the Z80 starts at $0000
	move.w	#$0000,Z80_BUSREQ	; hand the bus back — the Z80 runs the driver

Forever:
	bra	Forever			; the music plays on the Z80; the 68000 idles

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

; ---- the Z80 sound driver (assembled from src/sound/driver.s80) -----------
	even
Z80Driver:
	incbin	"src/sound/driver.bin"
Z80DriverEnd:
	even
