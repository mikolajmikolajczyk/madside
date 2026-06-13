---
title: Your first build & run
description: Assemble and run the Atari hello-world template.
---

This walks through the **Atari — Hello World** template: assemble it, run it, and see it print to the screen.

## 1. Create the project

Open **File → Templates → Atari — Hello World** (or pick it from the welcome picker on first run). madside creates a project with two source files and opens `src/hello.a65`.

The program writes `HELLO ATARI!` to screen memory:

```asm
        icl 'atari.a65'
        org $2000

screen = $80

start
        lda SAVMSC
        sta screen
        lda SAVMSC+1
        sta screen+1

        ldy #0
print
        lda hello_world,y
        cmp #$ff
        beq loop
        sta (screen),y
        iny
        jmp print
loop
        jmp loop

        run start

hello_world
        dta d'HELLO ATARI!', $ff
```

## 2. Assemble

madside assembles automatically as you type (debounced). The **Output** panel below the editor shows the result; when it succeeds you'll see an `ok` badge and the byte count. An **address gutter** appears next to each line that emits code — handy when setting breakpoints.

You can also force a build with **Ctrl+B**, or **Ctrl+S** (which also takes a snapshot).

## 3. Run

Press **Run** (the ▶ button, or **Ctrl+Enter**). The emulator boots, loads the assembled binary, and starts. The canvas on the right shows the Atari screen with the text drawn.

- **Pause** / **Stop** halt the run; **Step** advances one instruction, **Frame** one display frame.
- Click in the gutter next to a line to set a **breakpoint** — the run pauses there and the register / memory panels show the machine state.

## Next

Take the [Workspace tour](/docs/getting-started/workspace/) to learn what each panel does.
