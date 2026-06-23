; Smoke test for the clownassembler wasm build — one M68k instruction with a
; known encoding. `move.w #$1234,d0` assembles to 30 3C 12 34.
	move.w	#$1234,d0
