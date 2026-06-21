// zcc.wasm fork/exec shim: zcc drives sub-tools via system(); WASI has no
// process spawning, so we route system() to a host import (env.run) that runs
// the named sub-tool wasm on the shared VFS and returns its exit code.
#include <fcntl.h>
#include <string.h>
#include <stdio.h>
#include <unistd.h>
#include <sys/stat.h>

__attribute__((import_module("env"), import_name("run")))
extern int __zcc_host_run(const char *cmd);

int system(const char *cmd) {
    if (!cmd) return 1;                 // "is a shell available?" → yes
    return __zcc_host_run(cmd);
}

// wasi-libc lacks mkstemp/tmpfile; zcc uses temp files.
static unsigned long _seed = 0;
int mkstemp(char *tmpl) {
    size_t len = strlen(tmpl);
    if (len < 6) return -1;
    char *x = tmpl + len - 6;
    for (int a = 0; a < 4096; a++) {
        unsigned long v = (++_seed * 2654435761UL) ^ (unsigned long)(size_t)tmpl;
        for (int i = 0; i < 6; i++) { x[i] = 'A' + (char)(v % 26); v /= 26; }
        int fd = open(tmpl, O_RDWR | O_CREAT | O_EXCL, 0600);
        if (fd >= 0) return fd;
    }
    return -1;
}
char *mkdtemp(char *tmpl) {
    size_t len = strlen(tmpl);
    if (len < 6) return 0;
    char *x = tmpl + len - 6;
    for (int a = 0; a < 4096; a++) {
        unsigned long v = (++_seed * 2654435761UL) ^ (unsigned long)(size_t)tmpl;
        for (int i = 0; i < 6; i++) { x[i] = 'A' + (char)(v % 26); v /= 26; }
        if (mkdir(tmpl, 0700) == 0) return tmpl;
    }
    return 0;
}
FILE *tmpfile(void) {
    char name[] = "/tmp/zcctmpXXXXXX";
    int fd = mkstemp(name);
    if (fd < 0) return NULL;
    FILE *f = fdopen(fd, "w+b");
    if (!f) { close(fd); return NULL; }
    return f;
}
