; NES PRG-ROM banking demo (UxROM / mapper 2) — bank-aware debugging.
;
; Two routines live at the SAME address $8000, in two DIFFERENT PRG-ROM banks.
; UxROM maps one bank into the $8000-$BFFF window at a time; $C000-$FFFF is the
; fixed last bank. The program enters bank 0 (sets a blue background), then hands
; off through the fixed bank to bank 1 (green), which loops forever.
;
; Try the debugger: set a breakpoint on `b0entry` and another on `b1entry`. Both
; sit at $8000 — but the gutter tags each with its bank (`b0` / `b1`), and each
; breakpoint fires only while ITS bank is the live one. The memory panel's bank
; badge shows the live bank too. Same address, different banks, told apart by the
; live mapper state.
;
; The banked layout (which segment goes in which bank) lives in banked.cfg.

.segment "HEADER"           ; iNES header — 3×16 KB PRG, CHR-RAM, mapper 2 (UxROM)
    .byte "NES", $1a
    .byte 3, 0, $20, 0
    .byte 0, 0, 0, 0, 0, 0, 0, 0

.segment "CODE0"            ; PRG bank 0 — runs in the $8000 window
b0entry:
    lda #$01
    sta $10                 ; marker: bank 0 ran
    lda #$21                ; blue
    jsr set_bg
    jmp to_bank1            ; leave the window via the fixed-bank trampoline

.segment "CODE1"            ; PRG bank 1 — SAME $8000 address, different bank
b1entry:
    lda #$02
    sta $10                 ; marker: bank 1 ran
    lda #$2a                ; green
    jsr set_bg
b1loop:
    jmp b1loop              ; loop forever in bank 1

.segment "CODEF"            ; fixed last bank @ $C000 — reset, trampoline, helper
reset:
    sei
    cld
    ldx #$ff
    txs
    inx                     ; x = 0
    stx $2000               ; PPUCTRL = 0 (NMI off)
    stx $2001               ; PPUMASK = 0 (rendering off)
vwait1:
    bit $2002               ; wait two vblanks for PPU warm-up
    bpl vwait1
vwait2:
    bit $2002
    bpl vwait2
    lda #0
    sta $8000               ; select PRG bank 0 into the window
    jmp $8000               ; run bank 0's code

to_bank1:
    lda #1
    sta $8000               ; select PRG bank 1
    jmp $8000               ; run bank 1's code

set_bg:                     ; A = colour -> universal background ($3F00)
    ldx #$3f
    stx $2006
    ldx #$00
    stx $2006
    sta $2007
    lda #%00001110          ; PPUMASK: show background
    sta $2001
    rts

nmi:
    rti
irq:
    rti

.segment "VECTORS"
    .word nmi
    .word reset
    .word irq
