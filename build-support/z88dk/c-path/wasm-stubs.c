// WASI has no process spawning. z80asm references system() only for the m4
// preprocessor (options.cpp) and an unused modlink path — neither is on the
// assemble+link flow. Stub to a hard failure so those paths error cleanly.
int system(const char *command) {
    (void)command;
    return -1;
}

// wasi-libc lacks mkstemp; appmake uses it (mktempfile) for chain temp files.
// Minimal implementation over WASI open(): replace the trailing XXXXXX, create
// exclusively. Uniqueness from a counter mixed with the template address.
#include <fcntl.h>
#include <string.h>
#include <stdio.h>
#include <unistd.h>

static unsigned long _tmp_seed = 0;

int mkstemp(char *tmpl) {
    size_t len = strlen(tmpl);
    if (len < 6) return -1;
    char *x = tmpl + len - 6;
    for (int attempt = 0; attempt < 4096; attempt++) {
        unsigned long v = (++_tmp_seed * 2654435761UL) ^ (unsigned long)(size_t)tmpl;
        for (int i = 0; i < 6; i++) { x[i] = 'A' + (char)(v % 26); v /= 26; }
        int fd = open(tmpl, O_RDWR | O_CREAT | O_EXCL, 0600);
        if (fd >= 0) return fd;
    }
    return -1;
}

// wasi-libc lacks tmpfile; sccz80 uses it for intermediate codegen buffers.
// Create a uniquely-named file under /tmp and return a FILE* opened on it.
// (Auto-unlink-on-close isn't supported under WASI; leftover temps in the VFS
// are harmless — the toolchain mounts a fresh FS per build.)
FILE *tmpfile(void) {
    char name[] = "/tmp/sccz80tmpXXXXXX";
    int fd = mkstemp(name);
    if (fd < 0) return NULL;
    FILE *f = fdopen(fd, "w+b");
    if (!f) { close(fd); return NULL; }
    return f;
}
