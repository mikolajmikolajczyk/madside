#!/usr/bin/env python3
# Patch zcc.c's zcc_vasprintf for WASI: it length-probes a format string by
# fprintf-ing into /dev/null, which WASI has no node for — so every built
# command came out empty. Replace the probe with vsnprintf(NULL,0,...).
#
# Idempotent. Literal match against the pinned z88dk ref
# (d6ea38777b002a5888138f4c1825fe9ac1647153) — fails loudly if upstream changed
# the function, which is the signal to re-verify the patch before re-pinning.
#
# Usage: patch-vasprintf.py /path/to/src/zcc/zcc.c
import sys

ORIG = '''    /* This isn't performant, but we don't use it that much */
    if (
#ifndef WIN32
    (fp = fopen("/dev/null", "w")) != NULL
#else
        (fp = fopen("NUL", "w")) != NULL
#endif
        ) {
        req = vfprintf(fp, fmt, ap);
        fclose(fp);
        ret = calloc(req + 1, sizeof(char));
        req = vsnprintf(ret, req + 1, fmt, saveap);
        *s = ret;
    }
    else {
        *s = NULL;
        req = -1;
    }'''

NEW = '''    /* WASI has no /dev/null to open — measure with vsnprintf(NULL,0,...). */
    (void)fp;
    req = vsnprintf(NULL, 0, fmt, ap);
    ret = calloc(req + 1, sizeof(char));
    req = vsnprintf(ret, req + 1, fmt, saveap);
    *s = ret;'''


def main(path: str) -> None:
    with open(path, encoding="utf-8") as f:
        src = f.read()
    if "vsnprintf(NULL, 0, fmt, ap)" in src:
        print("patch-vasprintf: already applied, skipping")
        return
    if ORIG not in src:
        sys.exit("patch-vasprintf: original block not found — upstream changed? re-verify against the pin")
    with open(path, "w", encoding="utf-8") as f:
        f.write(src.replace(ORIG, NEW, 1))
    print("patch-vasprintf: applied")


if __name__ == "__main__":
    main(sys.argv[1])
