#!/usr/bin/env python3
"""Package a cc65 target sysroot (<target>.cfg + <target>.lib + include/ +
asminc/) into a zip the toolchain plugin mounts into the in-browser WASI
filesystem. Used by the sysroot just recipes (the `zip` CLI isn't guaranteed on
PATH).

Usage: make-sysroot-zip.py <cc65-dir> <target> <out.zip>
Paths inside the zip are rooted (<target>.cfg, lib/<target>.lib, include/...,
asminc/...) so unzipping at the WASI FS root lands them where cc65/ca65/ld65
expect (cc65 -t <target>).
"""
import os
import sys
import zipfile

cc65, target, out = sys.argv[1], sys.argv[2], sys.argv[3]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    z.write(os.path.join(cc65, "cfg", f"{target}.cfg"), f"{target}.cfg")
    z.write(os.path.join(cc65, "lib", f"{target}.lib"), f"lib/{target}.lib")
    for top in ("include", "asminc"):
        base = os.path.join(cc65, top)
        for root, _, files in os.walk(base):
            for f in files:
                full = os.path.join(root, f)
                z.write(full, os.path.relpath(full, cc65))

print(f"wrote {out} ({os.path.getsize(out)} bytes)")
