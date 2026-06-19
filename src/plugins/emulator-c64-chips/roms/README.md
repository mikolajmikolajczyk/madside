# C64 ROMs — MEGA65 Open ROMs (GPL-3)

These are **not** the Commodore KERNAL/BASIC/CHARGEN ROMs. Those are
Cloanto-copyright and are deliberately never shipped. The chips C64 core
(`../wasm/c64-core.cpp`) takes the ROM images at init, so the emulator runs
entirely on these free replacements:

| File | Size | Role |
|------|------|------|
| `kernal_generic.rom` | 8 KB | KERNAL replacement |
| `basic_generic.rom`  | 8 KB | BASIC replacement |
| `chargen_openroms.rom` | 4 KB | Character generator |

- **Source:** [MEGA65/open-roms](https://github.com/MEGA65/open-roms) `/bin`
  (pinned in `third-party.toml` → `[source.open_roms]`).
- **Licence:** GPL-3.0-or-later (see `COPYING`). Bundled as a runtime **data
  asset** — mere aggregation, it does not relicense the application.

To update: re-copy from a pinned open-roms checkout's `bin/` and bump the
`ref` in `third-party.toml`.
