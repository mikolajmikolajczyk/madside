; ZX Spectrum 128K memory-banking demo — bank-aware debugging.
;
; Two routines live at the SAME address $C000, in two DIFFERENT RAM banks. The
; 128K pages one of 8 RAM banks into the $C000-$FFFF window via port $7FFD
; (bits 0-2). The program enters bank 1 (red border), then hands off through the
; fixed $8000 code to bank 3 (green border), which loops forever.
;
; Try the debugger: set a breakpoint on `bank1_entry` and another on
; `bank3_entry`. Both sit at $C000 — but the gutter tags each with its bank
; (`b1` / `b3`), and each breakpoint fires only while ITS bank is paged in. The
; memory panel's bank badge shows the live bank too.
;
; The build places each BANK_n section into RAM bank n (and MAIN at $8000 = the
; always-mapped bank 2), wrapping it all into a 128K .z80 snapshot.

        SECTION MAIN            ; runs at $8000 (RAM bank 2 — always mapped)
        org $8000
start:
        di
        ld sp, $bff0
        ld bc, $7ffd
        ld a, 1
        out (c), a             ; page RAM bank 1 into $C000
        jp $c000               ; run bank 1's code

to_bank3:                      ; trampoline (outside the $C000 window, so paging
        ld bc, $7ffd           ; the window from under no running code is safe)
        ld a, 3
        out (c), a             ; page RAM bank 3
        jp $c000               ; run bank 3's code

        SECTION BANK_1         ; RAM bank 1, mapped at $C000 when selected
        org $c000
bank1_entry:
        ld a, 2                ; red
        out ($fe), a           ; border colour
        jp to_bank3            ; leave the window, switch to bank 3

        SECTION BANK_3         ; RAM bank 3 — SAME $C000 address, different bank
        org $c000
bank3_entry:
        ld a, 4                ; green
        out ($fe), a
bank3_loop:
        jp bank3_loop          ; loop forever in bank 3
