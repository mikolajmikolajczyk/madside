# ZX Spectrum 48K ROM

`48.rom` — the Sinclair ZX Spectrum 48K system ROM (16384 bytes,
SHA1 `5ea7c2b824672e914525d1d5c419d71b84a426a2`).

**Licence:** Amstrad holds the copyright to the Sinclair ROMs and in 1999 granted
permission to redistribute them freely for use with emulators. It is bundled here
on that basis (unlike the Cloanto-copyright Commodore ROMs, which are *not*
shipped — see `emulator-c64-chips/`). Recorded in `third-party.toml`
(`[source.zx_rom]`).

The chips `systems/zx.h` core copies this image into its own state at `init()`.
