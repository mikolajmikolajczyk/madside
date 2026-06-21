---
title: Your first build & run
description: Assemble and run the Atari hello-world template.
---

This walks through the **Atari — Hello World** template: assemble it, run it, and see it print to the screen.

## 1. Create the project

On first run madside shows the **welcome screen**. Pick **Atari — Hello World** from its templates (you can reopen this screen anytime with **File → New project**). madside creates a project with two source files and opens `src/hello.a65`.

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

By default madside builds when you **save** or **Run** — not on every keystroke — so large projects stay snappy. Press **Ctrl+S** (which also formats C sources and takes a snapshot) or **Ctrl+B** to build now; **Run** builds first if needed. The **Output** panel below the editor shows the result; when it succeeds you'll see an `ok` badge and the byte count. An **address gutter** appears next to each line that emits code — handy when setting breakpoints.

Prefer rebuild-as-you-type? Set `build.trigger: "auto"` in the project manifest (see [`project.json`](/docs/reference/manifest/)) to rebuild on every (debounced) edit.

## 3. Run

Press **Run** (the ▶ button, or **Ctrl+Enter**). The emulator boots, loads the assembled binary, and starts. The canvas on the right shows the Atari screen with the text drawn.

- **Pause** / **Stop** halt the run; **Step** advances one instruction, **Frame** one display frame.
- Click in the gutter next to a line to set a **breakpoint** — the run pauses there and the register / memory panels show the machine state.

## Next

Take the [Workspace tour](/docs/getting-started/workspace/) to learn what each panel does.
