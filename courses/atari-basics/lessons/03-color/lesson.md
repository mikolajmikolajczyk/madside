# Changing the Background Colour

The Atari's display is driven by hardware colour registers. The OS keeps
**shadow** copies in RAM and copies them to the hardware every frame, so you
write the shadow and let the OS do the rest. The background (playfield) colour
shadow is **`COLOR2`** at `$02C6`.

A colour byte packs hue in the high nibble and luminance in the low nibble:

```
        lda #$94          ; hue $9 (blue), luminance $4
        sta COLOR2        ; OS pushes it to the screen next frame
```

## Task

Set the background to **`$94`** (a medium blue). Store the value into `COLOR2`
in `src/main.a65`, keeping the `start` label. Run it — the screen background
should turn blue.

Press **Check**: it assembles your code and confirms `COLOR2` holds `$94`.
