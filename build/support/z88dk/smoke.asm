	org 0x8000
start:
	ld a,2
	out (0xfe),a
	ret
