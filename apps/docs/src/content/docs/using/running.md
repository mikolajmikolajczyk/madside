---
title: Running
description: Run controls, keyboard shortcuts, and audio.
sidebar:
  order: 4
---

Pressing **Run** boots your assembled binary in the in-browser emulator — Altirra (`altirra-wasm`) for Atari, jsnes for NES, Chips cores for the C64 (`chips-c64`) and ZX Spectrum (`zx-chips`), and Genesis Plus GX (`genesis-gpgx`) for the Sega Genesis. The emulator is a dockable panel; click its screen to give it keyboard focus, then type to send keys to the machine.

## Run controls

The controls live on the toolbar and in the **Run** menu:

| Control | What it does |
|---------|--------------|
| **Run** | Assembles if needed, loads the binary, and starts the emulator. From a paused state it resumes from the current PC. |
| **Pause** | Pauses the running emulator (only enabled while running). |
| **Stop** | Stops and unloads the emulator; the screen blanks and the next Run boots fresh. |
| **Step over** | Runs to the next source line, executing through library calls (only when paused). |
| **Step instruction** | Advances exactly one CPU instruction (only when paused). |
| **Frame** | Advances one full display frame (only when paused). |
| **Restart** | Re-assembles and restarts from the top. |

**Run** is "smart": after a pause or a breakpoint hit, the binary is still resident, so Run resumes from where it stopped. Only **Stop** (or a fresh boot) forces a reload.

Step and Frame are part of debugging — see [Debugging](/docs/using/debugging/) for how they interact with breakpoints and the panels.

## When Run can't start

Run needs a successfully-built binary. If you press Run when the [build](/docs/using/building/) has failed — or there's no binary to load — the emulator screen shows an overlay instead of booting:

- **"Compilation error. Check output."** — the build didn't produce a binary. Open the [Output panel](/docs/using/building/#the-output-panel) and fix the errors (they're also marked [inline in the editor](/docs/using/building/#inline-error-markers)).
- **"Failed to load binary. Check output."** — the build succeeded but the emulator couldn't load the result.

The overlay clears automatically on the next successful **Run** or when you press **Stop**.

## Keyboard shortcuts

The common controls have shortcuts:

| Key | Action |
|-----|--------|
| Ctrl+K (or Ctrl+Shift+P) | Command palette — search + run any action |
| Ctrl+Enter | Run |
| Ctrl+. | Pause |
| Ctrl+Shift+. | Stop |
| Ctrl+Shift+Enter | Restart |
| F10 | Step over (next source line) |
| Shift+F10 | Step instruction (one CPU instruction) |
| F11 | Step frame |
| F9 | Toggle breakpoint at cursor |
| Ctrl+S | Save + assemble + snapshot |
| Ctrl+B | Build |

Don't remember a shortcut? Open the **command palette** with `Ctrl+K` and type —
every action is there with its key shown next to it.

On macOS, use Cmd in place of Ctrl. The full table — including the editor and build shortcuts — lives in [Reference](/docs/reference/).

:::note
The browser-reload keys (F5, Ctrl+R, and friends) are deliberately **not** bound to Run, so refreshing the page never triggers a run by accident.
:::

## Audio

Audio is driven through the Web Audio API, which browsers only allow to start after a user gesture. The first **Run** counts as that gesture, so sound begins playing then. Audio is suspended while the emulator is paused or stopped.

:::note
On iPhone/iPad Safari, audio only works over **HTTPS** — iOS requires a secure connection for the audio engine. The hosted madside site is HTTPS, so sound just works there. If you self-host or use a local dev server over plain `http://`, iOS Safari loads madside fine but stays silent; serve it over HTTPS (a local tunnel or proxy) to hear audio on iOS.
:::
