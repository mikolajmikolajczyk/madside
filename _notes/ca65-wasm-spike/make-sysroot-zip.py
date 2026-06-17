#!/usr/bin/env python3
"""Package the cc65 NES sysroot (nes.cfg + nes.lib + include/ + asminc/) into a
zip the toolchain plugin mounts into the in-browser WASI filesystem. Used by the
`build-nes-sysroot` just recipe (the `zip` CLI isn't guaranteed on PATH).

Usage: make-sysroot-zip.py <cc65-dir> <out.zip>
Paths inside the zip are rooted (nes.cfg, lib/nes.lib, include/..., asminc/...)
so unzipping at the WASI FS root lands them where cc65/ca65/ld65 expect.
"""
import os
import sys
import zipfile

cc65, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join(cc65, "cfg", "nes.cfg"), "nes.cfg")
    z.write(os.path.join(cc65, "lib", "nes.lib"), "lib/nes.lib")
    for top in ("include", "asminc"):
        base = os.path.join(cc65, top)
        for root, _, files in os.walk(base):
            for f in files:
                full = os.path.join(root, f)
                z.write(full, os.path.relpath(full, cc65))

print(f"wrote {out} ({os.path.getsize(out)} bytes)")
