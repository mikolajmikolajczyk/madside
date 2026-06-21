# Hello, Atari

The Atari draws its text screen straight out of RAM. The OS keeps a pointer to
the top-left of that screen at **`SAVMSC`** (`$58`/`$59`). Store a byte there and
a character appears — but not in ASCII: the screen uses the Atari's own
**internal character codes** (ANTIC codes), where `A` is `33` and the digits and
punctuation are shuffled around too.

To write text you copy `SAVMSC` into a zero-page pointer, then store characters
through it with indirect-indexed addressing `(ptr),y`.

```
screen = $80                 ; a zero-page pointer

        lda SAVMSC           ; copy the OS screen pointer...
        sta screen
        lda SAVMSC+1
        sta screen+1
```

## Task

The starter already copies the pointer for you. Finish the loop in `src/main.a65`
so it writes the bytes of `msg` to the screen, stopping at the `$ff` terminator.
The label **`start`** must stay — it is the program entry point (`run start`).

Assemble and run it: you should see text appear in the top-left of the screen.
Press **Check** when it builds.
