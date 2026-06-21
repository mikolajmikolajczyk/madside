# Registers and Loops

The 6502 has three 8-bit registers you use constantly:

- **A** (accumulator) — the only register that does arithmetic.
- **X** and **Y** — index registers, used to count and to offset addresses.

A loop is just a counter plus a branch. You set up a count, do work, change the
count, and branch back while a condition holds. `dex` decrements X and sets the
**zero flag** when it reaches `0`, so `bne` (branch-if-not-equal-to-zero) is the
natural loop tail:

```
        ldx #8
loop
        ; ... do work ...
        dex
        bne loop          ; repeat until x == 0
```

## Task

In `src/main.a65`, write a solid bar of **16** inverse-space characters
(`$80`) across the top of the screen. Use `X` as your counter and `Y` as the
screen offset. Keep the label **`start`**.

Assemble, run, and press **Check**.
