.segment "CODE"
.org $0600
start:
    lda #$42
    sta $0200
    rts
